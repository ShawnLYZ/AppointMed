// Wire types for the adapter's public contract. Timestamps are ISO strings,
// prices are numbers (pg numeric arrives as string - serializers convert).

export interface ApiSpecialist {
  id: string;
  fullName: string;
  specialty: string;
  price: number;
  isActive: boolean;
}

export interface ApiSlot {
  id: string;
  specialistId: string;
  specialistName: string;
  specialty: string;
  startsAt: string;
  endsAt: string;
  price: number;
  hospitalId: string;
  hospitalName: string;
  hospitalAddress: string;
}

export interface ConfirmRequest {
  slotId: string;
  patientName: string;
  note?: string;
}

export interface DecisionRequest {
  externalAppointmentId: string;
  decision: 'confirm' | 'decline' | 'reschedule';
  proposedStartsAt?: string;
}
