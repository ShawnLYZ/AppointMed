import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../models/chat_message_model.dart';
import '../../models/slot_model.dart';
import '../../providers/chat_provider.dart';
import '../../widgets/hover_scale.dart';
import '../../widgets/hover_button.dart';

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen> {
  final TextEditingController _ctrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatProvider>().startConversation();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send() {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ctrl.clear();
    context.read<ChatProvider>().sendMessage(text);
    _scrollToBottom();
  }

  Future<void> _attachDocument() async {
    const kCamera = 'camera';
    const kGallery = 'gallery';
    const kFile = 'file';

    final choice = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: AppColors.neutral300,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            const Text('Attach medical document',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.neutral800)),
            const SizedBox(height: 8),
            ListTile(
              leading: _attachIcon(Icons.insert_drive_file),
              title: const Text('Choose file'),
              subtitle: const Text('PDF, DOC, images — lab results, referrals'),
              onTap: () => Navigator.pop(ctx, kFile),
            ),
            ListTile(
              leading: _attachIcon(Icons.camera_alt),
              title: const Text('Take a photo'),
              subtitle: const Text('Photograph a document or test result'),
              onTap: () => Navigator.pop(ctx, kCamera),
            ),
            ListTile(
              leading: _attachIcon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              subtitle: const Text('Select an existing image'),
              onTap: () => Navigator.pop(ctx, kGallery),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );

    if (choice == null || !mounted) return;

    if (choice == kFile) {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
        withData: false,
      );
      if (result == null || result.files.isEmpty || !mounted) return;
      final pf = result.files.first;
      if (pf.path == null) return;
      final isImage = ['jpg', 'jpeg', 'png']
          .contains(pf.extension?.toLowerCase());
      context.read<ChatProvider>().sendFile(
            File(pf.path!),
            pf.name,
            isImage: isImage,
          );
    } else {
      final source =
          choice == kCamera ? ImageSource.camera : ImageSource.gallery;
      final xfile = await _picker.pickImage(source: source, imageQuality: 80);
      if (xfile == null || !mounted) return;
      context.read<ChatProvider>().sendFile(
            File(xfile.path),
            xfile.name,
            isImage: true,
          );
    }

    _scrollToBottom();
  }

  Widget _attachIcon(IconData icon) => Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
            color: AppColors.primary100,
            borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: AppColors.primary600),
      );

  void _confirmReset() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Start new chat?'),
        content: const Text(
            'This will clear the current conversation and start fresh.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<ChatProvider>().resetChat();
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary600,
                foregroundColor: Colors.white),
            child: const Text('New chat'),
          ),
        ],
      ),
    );
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 200), () {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final chat = context.watch<ChatProvider>();

    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

    if (chat.error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(chat.error!),
            backgroundColor: AppColors.error500,
            action: SnackBarAction(
                label: 'Dismiss',
                textColor: Colors.white,
                onPressed: chat.clearError),
          ),
        );
        chat.clearError();
      });
    }

    final inputEnabled = chat.inputEnabled;

    final attachEnabled =
        chat.state == ChatState.chatting || chat.state == ChatState.idle;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.primary500, AppColors.primary700]),
                shape: BoxShape.circle,
              ),
              child:
                  const Icon(Icons.psychology, size: 20, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AppointMed Assistant',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                Text(chat.isTyping ? 'Typing...' : 'Online',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(fontWeight: FontWeight.w400)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'New chat',
            onPressed: _confirmReset,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: chat.messages.length + (chat.isTyping ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (i == chat.messages.length && chat.isTyping) {
                  return _buildTypingIndicator();
                }
                final msg = chat.messages[i];
                if (msg.type == ChatMessageType.image) {
                  return _buildImageBubble(msg);
                }
                if (msg.type == ChatMessageType.document) {
                  return _buildDocumentBubble(msg);
                }
                if (msg.isSpecial) return _buildSpecial(msg);
                return _buildBubble(msg);
              },
            ),
          ),
          _buildInput(inputEnabled, attachEnabled),
        ],
      ),
    );
  }

  // ── Message bubble ─────────────────────────────────────────────────────────

  Widget _buildBubble(ChatMessageModel msg) {
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment:
            msg.isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!msg.isUser) ...[_aiAvatar(), const SizedBox(width: 8)],
          Flexible(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color:
                    msg.isUser ? colorScheme.primary : colorScheme.surface,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                      color: colorScheme.shadow,
                      blurRadius: 10,
                      offset: const Offset(0, 2))
                ],
              ),
              child: Text(
                msg.text,
                style: TextStyle(
                    color: msg.isUser
                        ? colorScheme.onPrimary
                        : colorScheme.onSurface,
                    fontSize: 15,
                    height: 1.5),
              ),
            ),
          ),
          if (msg.isUser) ...[
            const SizedBox(width: 8),
            _userAvatar(),
          ],
        ],
      ),
    );
  }

  Widget _buildImageBubble(ChatMessageModel msg) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.file(
              File(msg.imageUrl!),
              width: 220,
              height: 180,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 220,
                height: 60,
                decoration: BoxDecoration(
                    color: AppColors.neutral100,
                    borderRadius: BorderRadius.circular(16)),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.broken_image, color: AppColors.neutral400),
                    SizedBox(width: 8),
                    Text('Could not load image',
                        style: TextStyle(color: AppColors.neutral500)),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _userAvatar(),
        ],
      ),
    );
  }

  Widget _buildDocumentBubble(ChatMessageModel msg) {
    final name = msg.fileName ?? 'Document';
    final ext = name.contains('.')
        ? name.split('.').last.toUpperCase()
        : 'FILE';
    final isPdf = ext == 'PDF';

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            constraints: const BoxConstraints(maxWidth: 240),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.primary50,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.primary200),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isPdf
                        ? const Color(0xFFFFEBEE)
                        : AppColors.primary100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    isPdf ? Icons.picture_as_pdf : Icons.insert_drive_file,
                    color: isPdf
                        ? const Color(0xFFE53935)
                        : AppColors.primary600,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.neutral800),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(ext,
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.neutral500)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _userAvatar(),
        ],
      ),
    );
  }

  // ── Special messages ───────────────────────────────────────────────────────

  Widget _buildSpecial(ChatMessageModel msg) {
    switch (msg.type) {
      case ChatMessageType.slotPicker:
        return _buildSlotPicker(msg.slots ?? []);
      case ChatMessageType.confirmation:
        return _buildConfirmation(msg.confirmedSlot!);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildSlotPicker(List<SlotModel> slots) {
    final chat = context.read<ChatProvider>();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          _aiAvatar(),
          const SizedBox(width: 8),
          Flexible(
            child: _card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: slots
                    .map((slot) => HoverScale(
                          scale: 1.02,
                          onTap: () => chat.selectSlot(slot),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.primary50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.primary200),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: AppColors.primary100,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(Icons.calendar_today,
                                      size: 20, color: AppColors.primary600),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                          '${slot.formattedDate} at ${slot.formattedTime}',
                                          style: const TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w600,
                                              color: AppColors.neutral800)),
                                      const SizedBox(height: 2),
                                      Text(
                                          '${slot.specialistName} • ${slot.hospitalName}',
                                          style: const TextStyle(
                                              fontSize: 13,
                                              color: AppColors.neutral500)),
                                      Text('RM ${slot.price.toStringAsFixed(0)}',
                                          style: TextStyle(
                                              fontSize: 12,
                                              color: AppColors.primary600,
                                              fontWeight: FontWeight.w500)),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right,
                                    color: AppColors.neutral400),
                              ],
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConfirmation(SlotModel slot) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                  colors: [AppColors.success500, Color(0xFF16A34A)]),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check, size: 16, color: Colors.white),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.success500.withValues(alpha: 0.1),
                    AppColors.success500.withValues(alpha: 0.05),
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: AppColors.success500.withValues(alpha: 0.3)),
              ),
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppColors.success500.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.check_circle,
                        size: 32, color: AppColors.success500),
                  ),
                  const SizedBox(height: 12),
                  const Text('Request sent — pending hospital confirmation',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.neutral800)),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: [
                        _row(Icons.calendar_today, 'Date', slot.formattedDate),
                        _row(Icons.access_time, 'Time', slot.formattedTime),
                        _row(Icons.person, 'Doctor', slot.specialistName),
                        _row(Icons.local_hospital, 'Hospital', slot.hospitalName),
                        _row(Icons.location_on, 'Address', slot.hospitalAddress),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.primary600),
          const SizedBox(width: 10),
          Text('$label: ',
              style: const TextStyle(fontSize: 13, color: AppColors.neutral500)),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.neutral800)),
          ),
        ],
      ),
    );
  }

  // ── Typing indicator ───────────────────────────────────────────────────────

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          _aiAvatar(),
          const SizedBox(width: 8),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 2))
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => _dot(i)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dot(int i) => AnimatedContainer(
        duration: Duration(milliseconds: 300 + i * 100),
        margin: const EdgeInsets.symmetric(horizontal: 2),
        width: 8,
        height: 8,
        decoration: const BoxDecoration(
            color: AppColors.primary400, shape: BoxShape.circle),
      );

  // ── Input bar ──────────────────────────────────────────────────────────────

  Widget _buildInput(bool enabled, bool attachEnabled) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        boxShadow: [
          BoxShadow(
              color: colorScheme.shadow,
              blurRadius: 10,
              offset: const Offset(0, -2))
        ],
      ),
      child: Row(
        children: [
          // Attachment button
          HoverIconButton(
            scale: 1.1,
            duration: const Duration(milliseconds: 150),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: attachEnabled
                    ? AppColors.primary50
                    : AppColors.neutral100,
                shape: BoxShape.circle,
              ),
              child: IconButton(
                icon: Icon(Icons.attach_file,
                    color: attachEnabled
                        ? AppColors.primary600
                        : AppColors.neutral400,
                    size: 20),
                onPressed: attachEnabled ? _attachDocument : null,
                tooltip: 'Attach document',
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Text field
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _ctrl,
                enabled: enabled,
                decoration: InputDecoration(
                  hintText: enabled
                      ? 'Type your message...'
                      : 'Waiting for response...',
                  border: InputBorder.none,
                  hintStyle:
                      TextStyle(color: colorScheme.onSurfaceVariant),
                ),
                onSubmitted: (_) => enabled ? _send() : null,
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Send button
          HoverIconButton(
            scale: 1.1,
            duration: const Duration(milliseconds: 150),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: enabled
                    ? const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [AppColors.primary500, AppColors.primary700])
                    : null,
                color: enabled ? null : AppColors.neutral300,
                shape: BoxShape.circle,
              ),
              child: IconButton(
                icon: const Icon(Icons.send, color: Colors.white, size: 18),
                onPressed: enabled ? _send : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Shared widgets ─────────────────────────────────────────────────────────

  Widget _aiAvatar() => Container(
        width: 32,
        height: 32,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.primary500, AppColors.primary700]),
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.psychology, size: 16, color: Colors.white),
      );

  Widget _userAvatar() {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
          color: colorScheme.primaryContainer, shape: BoxShape.circle),
      child: Icon(Icons.person, size: 16, color: colorScheme.primary),
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 10,
              offset: const Offset(0, 2))
        ],
      ),
      child: child,
    );
  }
}
