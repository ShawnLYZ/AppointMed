import 'dart:async';
import 'package:flutter/material.dart';
import '../services/data_service.dart';

class NotificationsProvider extends ChangeNotifier {
  final DataService _dataService;
  final String userId;
  List<Map<String, dynamic>> _items = [];
  StreamSubscription? _sub;
  String? lastNewTitle; // consumed by the UI to show a snackbar once
  bool _firstBatchSeen = false;

  NotificationsProvider({required this.userId, required DataService dataService})
      : _dataService = dataService {
    _sub = _dataService.streamNotifications(userId).listen((rows) {
      final hadIds = _items.map((n) => n['id']).toSet();
      final fresh = rows.where((n) => !hadIds.contains(n['id']) && n['read_at'] == null);
      if (_firstBatchSeen && fresh.isNotEmpty) lastNewTitle = fresh.last['title'];
      _firstBatchSeen = true;
      _items = rows.reversed.toList();
      notifyListeners();
    }, onError: (e) {
      debugPrint('notifications stream error: $e');
    });
  }

  List<Map<String, dynamic>> get items => _items;
  int get unreadCount => _items.where((n) => n['read_at'] == null).length;

  Future<void> markRead(String id) => _dataService.markNotificationRead(id);
  void consumeSnackbar() => lastNewTitle = null;

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
