import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_model.dart';
import '../models/appointment_model.dart';

class DataService {
  SupabaseClient get _client => Supabase.instance.client;

  Future<UserModel?> getProfile(String userId) async {
    final row = await _client.from('profiles').select().eq('id', userId).maybeSingle();
    return row == null ? null : UserModel.fromSupabase(row);
  }

  /// Only the RLS-granted columns: full_name, phone, passport, avatar_url.
  Future<void> updateProfile(String userId, Map<String, dynamic> data) async {
    await _client.from('profiles').update(data).eq('id', userId);
  }

  Stream<List<AppointmentModel>> streamUserAppointments(String userId) {
    return _client
        .from('appointments')
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .map((rows) => rows.map(AppointmentModel.fromSupabase).toList());
  }

  Stream<List<Map<String, dynamic>>> streamNotifications(String userId) {
    return _client
        .from('notifications')
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .order('created_at');
  }

  Future<void> markNotificationRead(String id) async {
    await _client.from('notifications')
        .update({'read_at': DateTime.now().toUtc().toIso8601String()}).eq('id', id);
  }
}
