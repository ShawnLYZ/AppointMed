import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/hover_button.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendReset() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return;

    await context.read<AuthProvider>().sendPasswordResetEmail(email);
    if (mounted) setState(() => _sent = true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

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
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: _sent ? _buildSuccess(theme) : _buildForm(theme, colorScheme),
        ),
      ),
    );
  }

  Widget _buildForm(ThemeData theme, ColorScheme colorScheme) {
    final auth = context.watch<AuthProvider>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: colorScheme.primaryContainer,
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.lock_reset_outlined,
              size: 40, color: colorScheme.primary),
        ),
        const SizedBox(height: 32),
        Text('Forgot Password?',
            style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700, color: colorScheme.onSurface)),
        const SizedBox(height: 12),
        Text(
          "Enter your email and we'll send you a link to reset your password.",
          style: theme.textTheme.bodyLarge
              ?.copyWith(color: colorScheme.onSurfaceVariant, height: 1.6),
        ),
        if (auth.error != null) ...[
          const SizedBox(height: 12),
          Text(auth.error!,
              style: const TextStyle(color: AppColors.error500, fontSize: 14)),
        ],
        const SizedBox(height: 32),
        TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(
            labelText: 'Email Address',
            hintText: 'patient@email.com',
            prefixIcon: Icon(Icons.email_outlined,
                color: colorScheme.onSurfaceVariant),
          ),
        ),
        const SizedBox(height: 24),
        HoverPrimaryButton(
          scale: 1.04,
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: auth.isLoading ? null : _sendReset,
              child: auth.isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Send Reset Link',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w600)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSuccess(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 100,
          height: 100,
          decoration: BoxDecoration(
            color: AppColors.success500.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.mark_email_read_outlined,
              size: 50, color: AppColors.success500),
        ),
        const SizedBox(height: 32),
        Text('Check Your Email',
            style: theme.textTheme.headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Text(
          'We sent a password reset link to ${_emailCtrl.text}',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge
              ?.copyWith(color: AppColors.neutral500, height: 1.6),
        ),
        const SizedBox(height: 32),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Back to Sign In'),
        ),
      ],
    );
  }
}
