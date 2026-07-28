import 'slot_model.dart';

class VerdictInfo {
  final String specialty;
  final String urgency;
  final String explanation;
  const VerdictInfo({required this.specialty, required this.urgency, required this.explanation});
  factory VerdictInfo.fromJson(Map<String, dynamic> j) => VerdictInfo(
        specialty: j['specialty'] ?? 'General Practice',
        urgency: j['urgency'] ?? 'routine',
        explanation: j['explanation'] ?? '',
      );
}

class AppointmentInfo {
  final String id;
  final String status;
  final DateTime startsAt;
  final String hospitalName;
  final String specialistName;
  final String specialty;
  final double? price;
  const AppointmentInfo({
    required this.id, required this.status, required this.startsAt,
    required this.hospitalName, required this.specialistName,
    required this.specialty, this.price,
  });
  factory AppointmentInfo.fromJson(Map<String, dynamic> j) => AppointmentInfo(
        id: j['id'], status: j['status'] ?? 'pending',
        startsAt: DateTime.parse(j['startsAt']),
        hospitalName: j['hospitalName'] ?? '', specialistName: j['specialistName'] ?? '',
        specialty: j['specialty'] ?? '',
        price: j['price'] == null ? null : (j['price'] as num).toDouble(),
      );
}

/// Envelope returned by every engine /consult endpoint (Phase 3 contract).
class ConsultReply {
  final String runId;
  final String node;      // intake | triage | match | book_request | hospital_review | postback | done
  final String status;    // active | waiting_hospital | completed | failed | escalated
  final String reply;
  final VerdictInfo? verdict;
  final List<SlotModel>? slotOptions;
  final AppointmentInfo? appointment;
  final bool escalated;
  final List<Map<String, dynamic>>? transcript; // only on GET /consult/:runId

  const ConsultReply({
    required this.runId, required this.node, required this.status, required this.reply,
    this.verdict, this.slotOptions, this.appointment, this.escalated = false, this.transcript,
  });

  factory ConsultReply.fromJson(Map<String, dynamic> j) => ConsultReply(
        runId: j['runId'], node: j['node'] ?? 'intake', status: j['status'] ?? 'active',
        reply: j['reply'] ?? '',
        verdict: j['verdict'] == null ? null : VerdictInfo.fromJson(j['verdict']),
        slotOptions: j['slotOptions'] == null
            ? null
            : (j['slotOptions'] as List)
                .map((s) => SlotModel.fromEngineJson(s as Map<String, dynamic>))
                .toList(),
        appointment: j['appointment'] == null ? null : AppointmentInfo.fromJson(j['appointment']),
        escalated: j['escalated'] == true,
        transcript: j['transcript'] == null
            ? null
            : (j['transcript'] as List).cast<Map<String, dynamic>>(),
      );
}
