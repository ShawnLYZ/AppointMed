import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

enum AppointmentStatus { pending, confirmed, rescheduleProposed, declined, cancelled, completed }

enum StatusSource { appointmed, hospitalPostback }

class AppointmentModel {
  final String id;
  final String userId;
  final String hospitalId;
  final String hospitalName;
  final String specialistId;
  final String specialistName;
  final String specialty;
  final String externalSlotId;
  final String externalAppointmentId;
  final DateTime startsAt;
  final DateTime? proposedStartsAt;
  final AppointmentStatus status;
  final StatusSource statusSource;
  final String? aiSummary;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool createdViaAI;

  const AppointmentModel({
    required this.id,
    required this.userId,
    required this.hospitalId,
    required this.hospitalName,
    required this.specialistId,
    required this.specialistName,
    required this.specialty,
    required this.externalSlotId,
    required this.externalAppointmentId,
    required this.startsAt,
    this.proposedStartsAt,
    required this.status,
    required this.statusSource,
    this.aiSummary,
    required this.createdAt,
    required this.updatedAt,
    required this.createdViaAI,
  });

  DateTime get dateTime => startsAt;

  String get statusLabel {
    switch (status) {
      case AppointmentStatus.pending:
        return 'Pending';
      case AppointmentStatus.confirmed:
        return 'Confirmed';
      case AppointmentStatus.rescheduleProposed:
        return 'New time proposed';
      case AppointmentStatus.declined:
        return 'Declined';
      case AppointmentStatus.cancelled:
        return 'Cancelled';
      case AppointmentStatus.completed:
        return 'Completed';
    }
  }

  Color get statusColor {
    switch (status) {
      case AppointmentStatus.pending:
        return AppColors.warning500;
      case AppointmentStatus.confirmed:
        return AppColors.success500;
      case AppointmentStatus.rescheduleProposed:
        return AppColors.warning500;
      case AppointmentStatus.declined:
        return AppColors.error500;
      case AppointmentStatus.cancelled:
        return AppColors.error500;
      case AppointmentStatus.completed:
        return AppColors.primary600;
    }
  }

  String get doctorInitials {
    final parts = specialistName.replaceFirst('Dr. ', '').trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return parts.isNotEmpty ? parts[0][0].toUpperCase() : '??';
  }

  factory AppointmentModel.fromSupabase(Map<String, dynamic> row) {
    return AppointmentModel(
      id: row['id'] ?? '',
      userId: row['user_id'] ?? '',
      hospitalId: row['hospital_id'] ?? '',
      hospitalName: row['hospital_name'] ?? '',
      specialistId: row['specialist_id'] ?? '',
      specialistName: row['specialist_name'] ?? '',
      specialty: row['specialty'] ?? '',
      externalSlotId: row['external_slot_id'] ?? '',
      externalAppointmentId: row['external_appointment_id'] ?? '',
      startsAt: DateTime.tryParse(row['starts_at'] ?? '') ?? DateTime.now(),
      proposedStartsAt: row['proposed_starts_at'] != null
          ? DateTime.tryParse(row['proposed_starts_at'])
          : null,
      status: _parseStatus(row['status']),
      statusSource: row['status_source'] == 'hospital_postback'
          ? StatusSource.hospitalPostback
          : StatusSource.appointmed,
      aiSummary: row['ai_summary'],
      createdAt: DateTime.tryParse(row['created_at'] ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at'] ?? '') ?? DateTime.now(),
      createdViaAI: row['created_via_ai'] ?? false,
    );
  }

  static AppointmentStatus _parseStatus(String? raw) {
    switch (raw) {
      case 'confirmed':
        return AppointmentStatus.confirmed;
      case 'reschedule_proposed':
        return AppointmentStatus.rescheduleProposed;
      case 'declined':
        return AppointmentStatus.declined;
      case 'cancelled':
        return AppointmentStatus.cancelled;
      case 'completed':
        return AppointmentStatus.completed;
      default:
        return AppointmentStatus.pending;
    }
  }
}
