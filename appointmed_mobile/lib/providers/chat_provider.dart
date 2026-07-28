import 'dart:io';
import 'package:flutter/material.dart';
import '../models/chat_message_model.dart';
import '../models/engine_models.dart';
import '../models/slot_model.dart';
import '../services/engine_client.dart';

enum ChatState { idle, chatting, showingSlots, waitingHospital, escalated, done }

class ChatProvider extends ChangeNotifier {
  final EngineClient _engine;
  final String userId;

  final List<ChatMessageModel> _messages = [];
  ChatState _state = ChatState.idle;
  String? _runId;
  bool _isTyping = false;
  String? _error;

  ChatProvider({required EngineClient engineClient, required this.userId})
      : _engine = engineClient;

  List<ChatMessageModel> get messages => List.unmodifiable(_messages);
  ChatState get state => _state;
  bool get isTyping => _isTyping;
  String? get error => _error;
  bool get inputEnabled =>
      _state == ChatState.chatting || _state == ChatState.showingSlots;

  Future<void> startConversation() async {
    if (_state != ChatState.idle) return;
    _setTyping(true);
    try {
      final r = await _engine.startConsult();
      _runId = r.runId;
      _apply(r);
    } catch (_) {
      _error = 'Could not reach the AppointMed engine. Is it running?';
      _state = ChatState.idle;
    }
    _setTyping(false);
  }

  void resetChat() {
    _messages.clear();
    _state = ChatState.idle;
    _runId = null;
    _error = null;
    notifyListeners();
    startConversation();
  }

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty || _isTyping || _runId == null || !inputEnabled) return;
    _messages.add(ChatMessageModel.user(text));
    _setTyping(true);
    try {
      _apply(await _engine.sendMessage(_runId!, text));
    } catch (_) {
      _error = 'Could not reach the AppointMed engine. Check your connection.';
    }
    _setTyping(false);
  }

  Future<void> sendFile(File file, String name, {bool isImage = false}) async {
    if (_isTyping || _runId == null) return;
    _messages.add(isImage
        ? ChatMessageModel.image(file.path)
        : ChatMessageModel.document(file.path, name));
    _setTyping(true);
    try {
      _apply(await _engine.uploadFile(_runId!, file, name));
    } on EngineException catch (e) {
      _error = e.code == 'uploads_only_during_intake'
          ? 'Attachments are only used while describing your symptoms.'
          : 'Upload failed. Please try again.';
    } catch (_) {
      _error = 'Upload failed. Please try again.';
    }
    _setTyping(false);
  }

  Future<void> selectSlot(SlotModel slot) async {
    if (_state != ChatState.showingSlots || _runId == null) return;
    _messages.add(ChatMessageModel.user(
        "I'd like ${slot.formattedDate} at ${slot.formattedTime} with ${slot.specialistName}"));
    _setTyping(true);
    try {
      final r = await _engine.selectSlot(_runId!, slot.id);
      if (r.escalated || r.status == 'escalated') {
        _apply(r);
      } else if (r.appointment != null) {
        _messages.add(ChatMessageModel.ai(r.reply));
        _messages.add(ChatMessageModel.confirmation(slot));
        _state = ChatState.waitingHospital;
      } else {
        _apply(r); // e.g. slot taken → engine re-enters match with a reply
      }
    } catch (_) {
      _error = 'Failed to submit the booking. Please try again.';
    }
    _setTyping(false);
  }

  /// Maps a ConsultReply envelope onto messages + state.
  void _apply(ConsultReply r) {
    if (r.reply.isNotEmpty) _messages.add(ChatMessageModel.ai(r.reply));
    if (r.escalated || r.status == 'escalated') {
      _state = ChatState.escalated;
    } else if (r.slotOptions != null && r.slotOptions!.isNotEmpty) {
      _messages.add(ChatMessageModel.slotPicker(r.slotOptions!));
      _state = ChatState.showingSlots;
    } else if (r.status == 'waiting_hospital') {
      _state = ChatState.waitingHospital;
    } else if (r.status == 'completed' || r.node == 'done') {
      _state = ChatState.done;
    } else {
      _state = ChatState.chatting;
    }
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void _setTyping(bool v) {
    _isTyping = v;
    notifyListeners();
  }

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }
}
