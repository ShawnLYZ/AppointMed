import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../models/appointment_model.dart';
import '../../providers/appointments_provider.dart';

class AppointmentsScreen extends StatefulWidget {
  const AppointmentsScreen({super.key});

  @override
  State<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends State<AppointmentsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Appointments'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white.withOpacity(0.7),
          tabs: const [Tab(text: 'Upcoming'), Tab(text: 'Past')],
        ),
      ),
      body: Consumer<AppointmentsProvider>(
        builder: (ctx, provider, _) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          return TabBarView(
            controller: _tabController,
            children: [
              _buildList(provider.upcoming, isUpcoming: true),
              _buildList(provider.past, isUpcoming: false),
            ],
          );
        },
      ),
    );
  }

  Widget _buildList(List<AppointmentModel> list, {required bool isUpcoming}) {
    if (list.isEmpty) {
      return _buildEmpty(isUpcoming);
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: list.length,
      itemBuilder: (_, i) =>
          _buildCard(list[i], isUpcoming: isUpcoming),
    );
  }

  Widget _buildEmpty(bool isUpcoming) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                  color: colorScheme.primaryContainer, shape: BoxShape.circle),
              child: Icon(
                  isUpcoming ? Icons.calendar_today_outlined : Icons.history,
                  size: 40,
                  color: colorScheme.primary),
            ),
            const SizedBox(height: 24),
            Text(
                isUpcoming
                    ? 'No upcoming appointments'
                    : 'No past appointments',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(
                isUpcoming
                    ? 'Start a chat with our AI assistant to book your first appointment.'
                    : 'Your appointment history will appear here.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: colorScheme.onSurfaceVariant, height: 1.5)),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(AppointmentModel appt, {required bool isUpcoming}) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
              color: colorScheme.shadow,
              blurRadius: 10,
              offset: const Offset(0, 4))
        ],
      ),
      child: Column(
        children: [
          // Status header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: appt.statusColor.withOpacity(0.1),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: appt.statusColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(appt.statusLabel,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: colorScheme.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: colorScheme.outlineVariant),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.calendar_today,
                          size: 14, color: colorScheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(DateFormat('MMM d').format(appt.dateTime),
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: colorScheme.onSurface)),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                        colors: [AppColors.primary500, AppColors.primary700],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(appt.doctorInitials,
                        style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: Colors.white)),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(appt.specialistName,
                          style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: colorScheme.onSurface)),
                      const SizedBox(height: 4),
                      Text(appt.specialty,
                          style: TextStyle(
                              fontSize: 14,
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w500)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(Icons.access_time,
                              size: 16,
                              color: colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(DateFormat('hh:mm a').format(appt.dateTime),
                              style: TextStyle(
                                  fontSize: 13,
                                  color: colorScheme.onSurfaceVariant)),
                          const SizedBox(width: 16),
                          Icon(Icons.location_on_outlined,
                              size: 16,
                              color: colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(appt.hospitalName,
                                style: TextStyle(
                                    fontSize: 13,
                                    color: colorScheme.onSurfaceVariant),
                                overflow: TextOverflow.ellipsis),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (appt.status == AppointmentStatus.rescheduleProposed &&
              appt.proposedStartsAt != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.warning500.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.warning500.withValues(alpha: 0.4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Hospital proposed: '
                      '${DateFormat('MMM d • hh:mm a').format(appt.proposedStartsAt!)}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () async {
                          final p = context.read<AppointmentsProvider>();
                          await p.accept(appt.id);
                          if (p.error != null && mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(p.error!)));
                          }
                        },
                        child: const Text('Accept new time'),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Actions
          if (isUpcoming &&
              (appt.status == AppointmentStatus.pending ||
                  appt.status == AppointmentStatus.confirmed))
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showCancelDialog(appt),
                      icon: const Icon(Icons.close, size: 18),
                      label: const Text('Cancel'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error500,
                        side: const BorderSide(color: AppColors.error500),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.directions, size: 18),
                      label: const Text('Directions'),
                    ),
                  ),
                ],
              ),
            ),
          if (!isUpcoming && appt.status == AppointmentStatus.completed)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.replay, size: 18),
                  label: const Text('Book Again'),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showCancelDialog(AppointmentModel appt) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Cancel Appointment'),
        content: Text(
            'Are you sure you want to cancel your appointment with ${appt.specialistName}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('No, keep it'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final p = context.read<AppointmentsProvider>();
              await p.cancel(appt.id);
              if (p.error != null && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(p.error!)));
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error500,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Yes, cancel'),
          ),
        ],
      ),
    );
  }
}
