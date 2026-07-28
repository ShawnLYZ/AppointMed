import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_config.dart';
import 'theme/app_theme.dart';
import 'theme/theme_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/appointments_provider.dart';
import 'providers/notifications_provider.dart';
import 'providers/chat_provider.dart';
import 'services/auth_service.dart';
import 'services/data_service.dart';
import 'services/engine_client.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/auth/sign_in_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/ai_chat/ai_chat_screen.dart';
import 'screens/appointments/appointments_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'widgets/app_logo.dart';

export 'theme/app_theme.dart' show AppColors;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Fail with a message naming the file to fix, rather than letting every
  // request die against a host that does not exist.
  if (!AppConfig.isConfigured) {
    throw StateError(
      'AppointMed is not configured: lib/core/app_config.dart still holds YOUR_... '
      'placeholders. Paste your own Supabase Project URL and anon key there '
      '(README.md section 6, Part D, step D4).',
    );
  }
  await Supabase.initialize(url: AppConfig.supabaseUrl, publishableKey: AppConfig.supabaseAnonKey);

  final authService = AuthService();
  final dataService = DataService();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(
          create: (_) => AuthProvider(
            authService: authService,
            dataService: dataService,
          ),
        ),
      ],
      child: const AppointMedApp(),
    ),
  );
}

class AppointMedApp extends StatelessWidget {
  const AppointMedApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeProvider>(
      builder: (_, themeProvider, __) {
        return MaterialApp(
          title: 'AppointMed',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: themeProvider.themeMode,
          home: const RootScreen(),
        );
      },
    );
  }
}

/// Routes to the correct screen based on auth state and onboarding status.
class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (auth.isLoading) {
      return const _SplashScreen();
    }

    if (auth.isAuthenticated) {
      // Provide AppointmentsProvider scoped to the authenticated user
      return MultiProvider(
        providers: [
          ChangeNotifierProvider(
            create: (_) => AppointmentsProvider(
              userId: auth.user!.id,
              dataService: DataService(),
              engineClient: EngineClient(
                  tokenProvider: () => Supabase.instance.client.auth.currentSession?.accessToken),
            ),
          ),
          ChangeNotifierProvider(
            create: (_) => NotificationsProvider(userId: auth.user!.id, dataService: DataService()),
          ),
          ChangeNotifierProvider(
            create: (_) => ChatProvider(
              engineClient: EngineClient(
                  tokenProvider: () => Supabase.instance.client.auth.currentSession?.accessToken),
              userId: auth.user!.id,
            ),
          ),
        ],
        child: const MainScreen(),
      );
    }

    if (!auth.onboardingDone) {
      return const OnboardingScreen();
    }

    return const SignInScreen();
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AppLogo(size: 96),
            SizedBox(height: 24),
            Text('AppointMed',
                style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary600)),
            SizedBox(height: 8),
            Text('One AI chat. Every hospital.',
                style: TextStyle(fontSize: 14, color: AppColors.neutral500)),
            SizedBox(height: 48),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  void _goTo(int index) => setState(() => _currentIndex = index);

  @override
  Widget build(BuildContext context) {
    final screens = [
      HomeScreen(
        onChatTap: () => _goTo(1),
        onAppointmentsTap: () => _goTo(2),
      ),
      const AIChatScreen(),
      const AppointmentsScreen(),
      const ProfileScreen(),
    ];

    final notifications = context.watch<NotificationsProvider>();
    if (notifications.lastNewTitle != null) {
      final title = notifications.lastNewTitle!;
      notifications.consumeSnackbar();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(title), behavior: SnackBarBehavior.floating));
      });
    }

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: _goTo,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'AI Chat',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_today_outlined),
            selectedIcon: Icon(Icons.calendar_today),
            label: 'Appointments',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
