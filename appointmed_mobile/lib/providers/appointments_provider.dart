import 'dart:async';
import 'package:flutter/material.dart';
import '../models/appointment_model.dart';
import '../services/data_service.dart';
import '../services/engine_client.dart';

class AppointmentsProvider extends ChangeNotifier {
  final DataService _dataService;
  final EngineClient _engineClient;
  final String userId;

  List<AppointmentModel> _upcoming = [];
  List<AppointmentModel> _past = [];
  StreamSubscription<List<AppointmentModel>>? _subscription;
  bool _isLoading = true;
  String? _error;

  AppointmentsProvider({
    required this.userId,
    required DataService dataService,
    required EngineClient engineClient,
  })  : _dataService = dataService,
        _engineClient = engineClient {
    _listen();
  }

  List<AppointmentModel> get upcoming => _upcoming;
  List<AppointmentModel> get past => _past;
  bool get isLoading => _isLoading;
  String? get error => _error;

  // First upcoming appointment for the Home screen banner
  AppointmentModel? get nextAppointment =>
      _upcoming.isNotEmpty ? _upcoming.first : null;

  void _listen() {
    _subscription =
        _dataService.streamUserAppointments(userId).listen((all) {
      _upcoming = all
          .where((a) =>
              a.status == AppointmentStatus.pending ||
              a.status == AppointmentStatus.confirmed ||
              a.status == AppointmentStatus.rescheduleProposed)
          .toList()
        ..sort((a, b) => a.dateTime.compareTo(b.dateTime));

      _past = all
          .where((a) =>
              a.status == AppointmentStatus.declined ||
              a.status == AppointmentStatus.cancelled ||
              a.status == AppointmentStatus.completed)
          .toList()
        ..sort((a, b) => b.dateTime.compareTo(a.dateTime));

      _isLoading = false;
      _error = null;
      notifyListeners();
    }, onError: (e) {
      _isLoading = false;
      _error = 'Failed to load appointments.';
      notifyListeners();
    });
  }

  Future<void> cancel(String appointmentId) => _respond(appointmentId, 'cancel');
  Future<void> accept(String appointmentId) => _respond(appointmentId, 'accept_reschedule');
  // UI deferred: the re_match slot options need routing into ChatProvider (follow-up).
  Future<void> rematch(String appointmentId) => _respond(appointmentId, 're_match');

  Future<void> _respond(String id, String action) async {
    _error = null;
    try {
      await _engineClient.respond(id, action);
    } catch (_) {
      _error = 'Action failed. Please try again.';
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
