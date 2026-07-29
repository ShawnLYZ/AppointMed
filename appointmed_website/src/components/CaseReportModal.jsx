import { useCallback, useEffect, useState } from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { engine } from '../lib/engine'
import { useAuth } from '../context/AuthContext'
import './CaseReportModal.css'

// Ordered as a clinician reads a case: what's wrong, the story, background,
// what the files show, then the AI's own routing. redFlags and the banner are
// rendered separately above this list.
const SECTIONS = [
  ['chiefComplaint', 'Chief complaint'],
  ['historyOfPresentIllness', 'History of present illness'],
  ['associatedSymptoms', 'Associated symptoms'],
  ['pastMedicalHistory', 'Past medical history'],
  ['currentMedications', 'Current medications'],
  ['attachmentFindings', 'Attachment findings'],
  ['triageAssessment', 'AI triage assessment'],
  ['clinicianNotes', 'Notes for the clinician'],
]

export default function CaseReportModal({ appointment, onClose, onDecide, busy, canDecide }) {
  const { session } = useAuth()
  const [attachments, setAttachments] = useState(null)
  const [attachmentError, setAttachmentError] = useState(null)
  // Names of attachments whose signed image URL failed to load (expired before the
  // modal was closed). Driven by state rather than reaching into the DOM from the
  // <img>'s onError, so the fallback stays inside React's own reconciliation instead
  // of detaching a node React still holds a fiber for.
  const [broken, setBroken] = useState(() => new Set())

  const appointmentId = appointment?.id
  const token = session?.access_token

  // Fires only when the modal is open, so signed URLs are minted for the one
  // case being reviewed - never for every card in the queue - and the audit log
  // records real views rather than page loads.
  const loadAttachments = useCallback(async () => {
    if (!appointmentId || !token) return
    setAttachmentError(null)
    // A retry mints fresh signed URLs, so a file marked broken under the old ones
    // deserves another chance rather than staying permanently marked.
    setBroken(new Set())
    try {
      const body = await engine.appointmentAttachments(appointmentId, token)
      setAttachments(body.attachments ?? [])
    } catch (err) {
      setAttachmentError(err)
    }
  }, [appointmentId, token])

  // Same queueMicrotask(load) shape as Dashboard.jsx/Requests.jsx/Settings.jsx: defers the
  // setState-reaching call by a tick so react-hooks/set-state-in-effect doesn't flag it,
  // while still guaranteeing the fetch runs as soon as this modal mounts (i.e. is opened).
  useEffect(() => { queueMicrotask(loadAttachments) }, [loadAttachments])

  if (!appointment) return null

  const report = appointment.ai_report
  const manifest = appointment.ai_attachments ?? []
  const degraded = report && (report.generated === 'fallback' || report.triageDegraded)

  return (
    <Modal isOpen onClose={onClose} title={appointment.patient_name || 'Patient'} size="lg">
      <div className="case-report">
        {degraded && (
          <p className="case-report__banner" role="status">
            ⚠ {report.generated === 'fallback'
              ? 'AI reasoning was unavailable — this report was assembled automatically from the patient\'s own answers.'
              : 'AI triage was unavailable — the specialty below is an automatic default, not an assessment.'}
          </p>
        )}

        {!report ? (
          // Booked before case reports existed: show what that row does have.
          <section className="case-report__section">
            <h3>AI case summary</h3>
            <p>{appointment.ai_summary || 'No summary was recorded for this request.'}</p>
          </section>
        ) : (
          <>
            {report.redFlags?.length > 0 && (
              <div className="case-report__flags">
                <h3>⚠ Red flags</h3>
                <ul>{report.redFlags.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
            {SECTIONS.map(([key, label]) => (
              <section key={key} className="case-report__section">
                <h3>{label}</h3>
                <p>{report[key] || 'Not reported'}</p>
              </section>
            ))}
          </>
        )}

        <section className="case-report__section">
          <h3>Patient uploads ({manifest.length})</h3>
          {manifest.length === 0 ? (
            <p>No files were uploaded.</p>
          ) : attachmentError ? (
            <div className="case-report__attach-error">
              <p>Couldn&apos;t load the uploaded files. The report above is complete.</p>
              <Button variant="secondary" size="sm" onClick={loadAttachments}>Retry</Button>
            </div>
          ) : attachments === null ? (
            <p>Loading files…</p>
          ) : (
            <ul className="case-report__files">
              {attachments.map((a) => (
                <li key={a.name} className="case-report__file">
                  <span className="case-report__file-name">{a.name}</span>
                  <p className="case-report__file-note">{a.observation}</p>
                  {!a.signedUrl ? (
                    <p className="case-report__file-note">This file is currently unavailable.</p>
                  ) : a.type === 'image' ? (
                    broken.has(a.name) ? (
                      <p className="case-report__file-note">Link expired — reopen this case.</p>
                    ) : (
                      <a href={a.signedUrl} target="_blank" rel="noreferrer">
                        <img
                          className="case-report__thumb" src={a.signedUrl} alt={a.name}
                          onError={() => setBroken((s) => new Set(s).add(a.name))}
                        />
                      </a>
                    )
                  ) : (
                    <a className="case-report__pdf" href={a.signedUrl} target="_blank" rel="noreferrer">
                      📄 Open {a.name}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="case-report__actions">
          <Button onClick={() => onDecide(appointment, 'confirm')} disabled={busy || !canDecide}>Confirm</Button>
          <Button variant="secondary" onClick={() => onDecide(appointment, 'reschedule')} disabled={busy || !canDecide}>
            Propose new time
          </Button>
          <Button variant="danger" onClick={() => onDecide(appointment, 'decline')} disabled={busy || !canDecide}>
            Decline
          </Button>
        </div>
      </div>
    </Modal>
  )
}
