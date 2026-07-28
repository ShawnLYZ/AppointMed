import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  static const List<_OnboardingPage> _pages = [
    _OnboardingPage(
      title: 'All hospitals in one app',
      description:
          'Access multiple hospitals and specialists through a single unified platform.',
      icon: Icons.local_hospital_outlined,
      color: AppColors.primary500,
      backgroundImage: 'assets/images/allHospitalsInOneAppImage.JPG',
    ),
    _OnboardingPage(
      title: 'AI that understands your symptoms',
      description:
          'Our intelligent assistant guides you to the right specialist for your needs.',
      icon: Icons.psychology_outlined,
      color: AppColors.accent500,
      backgroundImage: 'assets/images/AIThatUnderstandsYourSymptoms.JPG',
    ),
    _OnboardingPage(
      title: 'Book an appointment in 2 minutes',
      description:
          'Quick and easy booking process. Get confirmed appointments instantly.',
      icon: Icons.calendar_today_outlined,
      color: AppColors.primary600,
      backgroundImage: 'assets/images/appointment.jpg',
    ),
  ];

  void _goToSignIn() {
    context.read<AuthProvider>().completeOnboarding();
    // RootScreen will automatically navigate to SignInScreen
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (i) => setState(() => _currentPage = i),
                itemCount: _pages.length,
                itemBuilder: (_, i) => _buildPage(_pages[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _pages.length,
                      (i) => AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: _currentPage == i ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: _currentPage == i
                              ? AppColors.primary500
                              : AppColors.neutral300,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: () {
                        if (_currentPage < _pages.length - 1) {
                          _pageController.nextPage(
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeInOut,
                          );
                        } else {
                          _goToSignIn();
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary600,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        _currentPage < _pages.length - 1
                            ? 'Next'
                            : 'Get Started',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: _currentPage < _pages.length - 1
                        ? TextButton(
                            onPressed: _goToSignIn,
                            style: TextButton.styleFrom(
                                foregroundColor: AppColors.neutral500),
                            child: const Text('Skip',
                                style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w500)),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPage(_OnboardingPage page) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(page.backgroundImage, fit: BoxFit.cover),
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withOpacity(0.3),
                Colors.black.withOpacity(0.6),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(40.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surface
                      .withOpacity(0.9),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.2),
                      blurRadius: 20,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(page.icon, size: 56, color: page.color),
              ),
              const SizedBox(height: 48),
              Text(
                page.title,
                textAlign: TextAlign.center,
                style:
                    Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          shadows: const [
                            Shadow(
                                color: Colors.black45,
                                blurRadius: 10,
                                offset: Offset(0, 2))
                          ],
                        ),
              ),
              const SizedBox(height: 16),
              Text(
                page.description,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Colors.white,
                      height: 1.6,
                      shadows: const [
                        Shadow(
                            color: Colors.black45,
                            blurRadius: 8,
                            offset: Offset(0, 2))
                      ],
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OnboardingPage {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final String backgroundImage;

  const _OnboardingPage({
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.backgroundImage,
  });
}
