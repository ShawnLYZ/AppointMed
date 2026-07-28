import 'package:intl/intl.dart';

class SlotModel {
  final String id;
  final String hospitalId;
  final String hospitalName;
  final String hospitalAddress;
  final String specialistId;
  final String specialistName;
  final String specialty;
  final DateTime dateTime;
  final double price;

  const SlotModel({
    required this.id,
    required this.hospitalId,
    required this.hospitalName,
    required this.hospitalAddress,
    required this.specialistId,
    required this.specialistName,
    required this.specialty,
    required this.dateTime,
    required this.price,
  });

  String get formattedDate {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final slotDay = DateTime(dateTime.year, dateTime.month, dateTime.day);
    final diff = slotDay.difference(today).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    return DateFormat('MMM d').format(dateTime);
  }

  String get formattedTime => DateFormat('hh:mm a').format(dateTime);

  factory SlotModel.fromEngineJson(Map<String, dynamic> j) => SlotModel(
        id: j['id'],
        hospitalId: j['hospitalId'] ?? '',
        hospitalName: j['hospitalName'] ?? '',
        hospitalAddress: j['hospitalAddress'] ?? '',
        specialistId: j['specialistId'] ?? '',
        specialistName: j['specialistName'] ?? '',
        specialty: j['specialty'] ?? '',
        dateTime: DateTime.parse(j['startsAt']),
        price: (j['price'] as num?)?.toDouble() ?? 0,
      );
}
