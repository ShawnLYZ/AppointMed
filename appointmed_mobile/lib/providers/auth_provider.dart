import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/app_config.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/data_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;
  final DataService _dataService;

  User? _user;
  UserModel? _userModel;
  bool _isLoading = true;
  bool _onboardingDone = false;
  String? _error;

  AuthProvider({required AuthService authService, required DataService dataService})
      : _authService = authService,
        _dataService = dataService {
    _init();
  }

  User? get user => _user;
  UserModel? get userModel => _userModel;
  bool get isLoading => _isLoading;
  bool get onboardingDone => _onboardingDone;
  bool get isAuthenticated => _user != null;
  String? get error => _error;

  Future<void> _init() async {
    final prefs = await SharedPreferences.getInstance();
    _onboardingDone = prefs.getBool(AppConfig.keyOnboardingDone) ?? false;

    _user = _authService.currentUser;
    if (_user != null) await _loadUserModel(_user!.id);
    _isLoading = false;
    notifyListeners();

    _authService.authStateChanges.listen((state) async {
      _user = state.session?.user;
      if (_user != null) {
        await _loadUserModel(_user!.id);
      } else {
        _userModel = null;
      }
      _isLoading = false;
      notifyListeners();
    });
  }

  Future<void> _loadUserModel(String uid) async {
    try {
      _userModel = await _dataService.getProfile(uid);
    } catch (e) {
      debugPrint('Failed to load user profile: $e');
    }
  }

  Future<void> completeOnboarding() async {
    _onboardingDone = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConfig.keyOnboardingDone, true);
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    _clearError();
    _isLoading = true;
    notifyListeners();
    try {
      await _authService.signIn(email: email, password: password);
    } on AuthException catch (e) {
      _error = _mapAuthError(e);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> register({
    required String email,
    required String password,
    required String fullName,
    required String passport,
    required String phone,
  }) async {
    _clearError();
    _isLoading = true;
    notifyListeners();
    try {
      await _authService.register(
          email: email, password: password, fullName: fullName, passport: passport, phone: phone);
    } on AuthException catch (e) {
      _error = _mapAuthError(e);
    } catch (_) {
      _error = 'Registration failed. Please try again.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    await _authService.signOut();
    _userModel = null;
    notifyListeners();
  }

  Future<void> sendPasswordResetEmail(String email) async {
    _clearError();
    try {
      await _authService.sendPasswordResetEmail(email);
    } on AuthException catch (e) {
      _error = _mapAuthError(e);
      notifyListeners();
    }
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    if (_user == null) return;
    _clearError();
    try {
      await _dataService.updateProfile(_user!.id, data);
      _userModel = await _dataService.getProfile(_user!.id);
    } catch (_) {
      _error = 'Could not save your changes. Please try again.';
    }
    notifyListeners();
  }

  Future<void> updatePassword(String current, String newPass) async {
    _clearError();
    try {
      await _authService.reauthenticate(email: _user!.email!, password: current);
      await _authService.updatePassword(newPass);
    } on AuthException catch (e) {
      _error = _mapAuthError(e);
      notifyListeners();
      rethrow;
    }
  }

  void clearError() => _clearError();

  void _clearError() {
    _error = null;
    notifyListeners();
  }

  String _mapAuthError(AuthException e) {
    final msg = e.message.toLowerCase();
    if (msg.contains('invalid login credentials')) return 'Incorrect email or password.';
    if (msg.contains('already registered')) return 'This email is already registered.';
    if (msg.contains('rate')) return 'Too many attempts. Please try again later.';
    if (msg.contains('password')) return 'Password must be at least 6 characters.';
    if (msg.contains('email')) return 'Please enter a valid email address.';
    return 'Authentication failed. Please try again.';
  }
}
