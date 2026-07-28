import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  SupabaseClient get _client => Supabase.instance.client;

  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  User? get currentUser => _client.auth.currentUser;
  String? get accessToken => _client.auth.currentSession?.accessToken;

  Future<void> signIn({required String email, required String password}) =>
      _client.auth.signInWithPassword(email: email, password: password);

  /// Profile row is created server-side by the handle_new_user trigger,
  /// which reads full_name/passport/phone from user metadata.
  Future<void> register({
    required String email,
    required String password,
    required String fullName,
    required String passport,
    required String phone,
  }) =>
      _client.auth.signUp(email: email, password: password, data: {
        'full_name': fullName,
        'passport': passport,
        'phone': phone,
      });

  Future<void> signOut() => _client.auth.signOut();

  Future<void> sendPasswordResetEmail(String email) =>
      _client.auth.resetPasswordForEmail(email);

  Future<void> updatePassword(String newPassword) =>
      _client.auth.updateUser(UserAttributes(password: newPassword));

  /// Supabase has no separate reauthenticate-with-password; verifying the
  /// current password is a fresh sign-in.
  Future<void> reauthenticate({required String email, required String password}) =>
      _client.auth.signInWithPassword(email: email, password: password);
}
