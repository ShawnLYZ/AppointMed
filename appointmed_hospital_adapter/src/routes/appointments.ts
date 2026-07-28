import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../server.js';
import type { ConfirmRequest, DecisionRequest } from '../types.js';

// General UUID shape (8-4-4-4-12 hex), not tied to a specific version/variant -
// fixtures use synthetic ids (e.g. "...-4000-8000-...") that satisfy this but
// aren't strictly valid UUIDv4. Good enough to keep non-UUID input out of SQL.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerAppointmentRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.post<{ Body: ConfirmRequest }>('/appointment/confirm', async (req, reply) => {
    const { slotId, patientName, note } = req.body;
    // A malformed slotId binds straight into `where s.id = $1` against a uuid
    // column and would raise a Postgres "invalid input syntax for type uuid"
    // error that escapes as 500. Reject it before the query runs, using the
    // same contract an absent-but-well-formed id gets.
    if (typeof slotId !== 'string' || !UUID_RE.test(slotId)) {
      return reply.code(404).send({ error: 'slot_not_found' });
    }
    const client = await deps.pool.connect();
    try {
      await client.query('begin');
      const slot = await client.query(
        `select s.id, s.status, s.starts_at, s.price, sp.full_name as specialist_name, sp.specialty
           from public.slots s
           join public.specialists sp on sp.id = s.specialist_id
          where s.id = $1 and s.hospital_id = $2
            and s.starts_at > now()
          for update of s`,
        [slotId, req.hospital.id],
      );
      if (slot.rows.length === 0) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'slot_not_found' });
      }
      if (slot.rows[0].status !== 'open') {
        await client.query('rollback');
        return reply.code(409).send({ error: 'slot_taken' });
      }
      await client.query(`update public.slots set status = 'booked' where id = $1`, [slotId]);
      const externalId = `ext_${randomBytes(8).toString('hex')}`;
      await client.query(
        `insert into public.hospital_bookings (hospital_id, slot_id, external_id, patient_name, note)
         values ($1, $2, $3, $4, $5)`,
        [req.hospital.id, slotId, externalId, patientName ?? '', note ?? null],
      );
      await client.query('commit');
      const s = slot.rows[0];
      return reply.code(201).send({
        externalAppointmentId: externalId,
        status: 'pending',
        slot: {
          id: s.id,
          startsAt: s.starts_at.toISOString(),
          specialistName: s.specialist_name,
          specialty: s.specialty,
          price: Number(s.price),
        },
      });
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post<{ Body: { externalAppointmentId: string } }>('/appointment/cancel', async (req, reply) => {
    const { externalAppointmentId } = req.body;
    const client = await deps.pool.connect();
    let bookingId: string;
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `update public.hospital_bookings
            set status = 'cancelled'
          where external_id = $1 and hospital_id = $2 and status <> 'cancelled'
          returning id, slot_id`,
        [externalAppointmentId, req.hospital.id],
      );
      if (rows.length === 0) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'booking_not_found' });
      }
      if (rows[0].slot_id) {
        await client.query(
          `update public.slots set status = 'open' where id = $1 and starts_at > now()`,
          [rows[0].slot_id],
        );
      }
      await client.query('commit');
      bookingId = rows[0].id;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }

    const delivered = await deps.postback({
      externalAppointmentId,
      hospitalId: req.hospital.id,
      action: 'cancelled',
    });
    await deps.pool.query(
      `update public.hospital_bookings
          set postback_delivered = $2, postback_attempts = postback_attempts + 1
        where id = $1`,
      [bookingId, delivered],
    );
    return { externalAppointmentId, status: 'cancelled', postbackDelivered: delivered };
  });

  app.post<{ Body: DecisionRequest }>('/appointment/decision', async (req, reply) => {
    const { externalAppointmentId, decision, proposedStartsAt } = req.body;
    if (!['confirm', 'decline', 'reschedule'].includes(decision)) {
      return reply.code(400).send({ error: 'invalid_decision' });
    }
    if (decision === 'reschedule' && !proposedStartsAt) {
      return reply.code(400).send({ error: 'proposed_time_required' });
    }
    // `proposed_starts_at` is timestamptz; a malformed value would otherwise
    // raise "invalid input syntax for type timestamp with time zone" from
    // Postgres and escape as a 500. Reject it before the transaction opens,
    // using the same contract a missing-but-required value gets. The Phase-5
    // portal lets a human type this value, so this is a real input risk.
    if (
      proposedStartsAt !== undefined &&
      proposedStartsAt !== null &&
      (typeof proposedStartsAt !== 'string' || Number.isNaN(Date.parse(proposedStartsAt)))
    ) {
      return reply.code(400).send({ error: 'proposed_time_required' });
    }
    const statusMap = { confirm: 'confirmed', decline: 'declined', reschedule: 'rescheduled' } as const;
    const newStatus = statusMap[decision];

    const client = await deps.pool.connect();
    let bookingId: string;
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `update public.hospital_bookings
            set status = $3, proposed_starts_at = $4
          where external_id = $1 and hospital_id = $2
            and status = 'pending'
          returning id, slot_id`,
        [externalAppointmentId, req.hospital.id, newStatus, proposedStartsAt ?? null],
      );
      if (rows.length === 0) {
        // Zero rows means either "no such booking for this hospital" or
        // "this booking was already decided". Tell them apart - a manager whose
        // colleague just decided the same request must not be told it vanished.
        const exists = await client.query(
          `select 1 from public.hospital_bookings where external_id = $1 and hospital_id = $2`,
          [externalAppointmentId, req.hospital.id],
        );
        await client.query('rollback');
        return exists.rows.length > 0
          ? reply.code(409).send({ error: 'already_decided' })
          : reply.code(404).send({ error: 'booking_not_found' });
      }
      if (decision === 'decline' && rows[0].slot_id) {
        await client.query(
          `update public.slots set status = 'open' where id = $1 and starts_at > now()`,
          [rows[0].slot_id],
        );
      }
      await client.query('commit');
      bookingId = rows[0].id;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }

    const payload = {
      externalAppointmentId,
      hospitalId: req.hospital.id,
      action: newStatus,
      ...(proposedStartsAt ? { proposedStartsAt } : {}),
    } as const;
    const delivered = await deps.postback(payload);
    await deps.pool.query(
      `update public.hospital_bookings
          set postback_delivered = $2, postback_attempts = postback_attempts + 1
        where id = $1`,
      [bookingId, delivered],
    );
    return { externalAppointmentId, status: newStatus, postbackDelivered: delivered };
  });
}
