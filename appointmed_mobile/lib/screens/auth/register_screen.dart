import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/hover_button.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameCtrl = TextEditingController();
  final _passportCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();
  bool _obscurePass = true;
  bool _agreed = false;
  String? _fieldError;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _passportCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _confirmPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    setState(() => _fieldError = null);

    if (_nameCtrl.text.trim().isEmpty ||
        _passportCtrl.text.trim().isEmpty ||
        _phoneCtrl.text.trim().isEmpty ||
        _emailCtrl.text.trim().isEmpty ||
        _passCtrl.text.isEmpty) {
      setState(() => _fieldError = 'Please fill in all fields.');
      return;
    }
    if (_passCtrl.text != _confirmPassCtrl.text) {
      setState(() => _fieldError = 'Passwords do not match.');
      return;
    }
    if (_passCtrl.text.length < 8) {
      setState(() => _fieldError = 'Password must be at least 8 characters.');
      return;
    }
    if (!_agreed) {
      setState(() => _fieldError = 'Please agree to the Terms and Privacy Policy.');
      return;
    }

    final auth = context.read<AuthProvider>();
    auth.clearError();
    await auth.register(
      email: _emailCtrl.text.trim(),
      password: _passCtrl.text,
      fullName: _nameCtrl.text.trim(),
      passport: _passportCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
    );
    // Navigation handled by RootScreen auth stream
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final auth = context.watch<AuthProvider>();

    if (auth.isAuthenticated) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
      });
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: HoverIconButton(
          scale: 1.08,
          child: IconButton(
            icon: Icon(Icons.arrow_back, color: colorScheme.onSurface),
            onPressed: () => Navigator.pop(context),
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Create Account',
                  style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: colorScheme.onSurface)),
              const SizedBox(height: 8),
              Text('Register to start booking appointments',
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(color: colorScheme.onSurfaceVariant)),
              const SizedBox(height: 32),
              if (_fieldError != null || auth.error != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.error500.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppColors.error500.withOpacity(0.3)),
                  ),
                  child: Text(
                    _fieldError ?? auth.error ?? '',
                    style: const TextStyle(
                        color: AppColors.error500, fontSize: 14),
                  ),
                ),
              _field(_nameCtrl, 'Full Name', Icons.person_outline),
              const SizedBox(height: 16),
              _field(_passportCtrl, 'Passport Number', Icons.badge_outlined),
              const SizedBox(height: 16),
              _field(_phoneCtrl, 'Phone Number', Icons.phone_outlined,
                  type: TextInputType.phone, hint: '+60 12 345 6789'),
              const SizedBox(height: 16),
              _field(_emailCtrl, 'Email Address', Icons.email_outlined,
                  type: TextInputType.emailAddress, hint: 'patient@email.com'),
              const SizedBox(height: 16),
              TextField(
                controller: _passCtrl,
                obscureText: _obscurePass,
                decoration: InputDecoration(
                  labelText: 'Password',
                  hintText: 'Minimum 8 characters',
                  prefixIcon: Icon(Icons.lock_outline,
                      color: colorScheme.onSurfaceVariant),
                  suffixIcon: IconButton(
                    icon: Icon(
                        _obscurePass
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        color: colorScheme.onSurfaceVariant),
                    onPressed: () =>
                        setState(() => _obscurePass = !_obscurePass),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _confirmPassCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'Confirm Password',
                  hintText: 'Re-enter your password',
                  prefixIcon: Icon(Icons.lock_outline,
                      color: colorScheme.onSurfaceVariant),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Checkbox(
                    value: _agreed,
                    onChanged: (v) => setState(() => _agreed = v ?? false),
                  ),
                  Expanded(
                    child: Wrap(children: [
                      Text('By registering you agree to our ',
                          style:
                              TextStyle(color: colorScheme.onSurfaceVariant)),
                      GestureDetector(
                        onTap: () {},
                        child: Text('Terms of Service',
                            style: TextStyle(color: colorScheme.primary)),
                      ),
                      Text(' and ',
                          style:
                              TextStyle(color: colorScheme.onSurfaceVariant)),
                      GestureDetector(
                        onTap: () {},
                        child: Text('Privacy Policy',
                            style: TextStyle(color: colorScheme.primary)),
                      ),
                    ]),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              HoverPrimaryButton(
                scale: 1.04,
                child: SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: auth.isLoading ? null : _register,
                    child: auth.isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Create Account',
                            style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Already have an account? ',
                      style:
                          TextStyle(color: colorScheme.onSurfaceVariant)),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Sign In'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController ctrl,
    String label,
    IconData icon, {
    TextInputType? type,
    String? hint,
  }) {
    final colorScheme = Theme.of(context).colorScheme;
    return TextField(
      controller: ctrl,
      keyboardType: type,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon:
            Icon(icon, color: colorScheme.onSurfaceVariant),
      ),
    );
  }
}
