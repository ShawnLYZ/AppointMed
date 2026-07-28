import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:appointmed_mobile/models/engine_models.dart';
import 'package:appointmed_mobile/models/chat_message_model.dart';
import 'package:appointmed_mobile/models/slot_model.dart';
import 'package:appointmed_mobile/providers/chat_provider.dart';
import 'package:appointmed_mobile/services/engine_client.dart';

class FakeEngineClient implements EngineClient {
  final List<ConsultReply> queue = [];
  @override
  String? Function() get tokenProvider => () => 't';
  @override
  String get baseUrl => 'http://fake';
  ConsultReply _next() => queue.removeAt(0);
  @override
  Future<ConsultReply> startConsult() async => _next();
  @override
  Future<ConsultReply> sendMessage(String runId, String text) async => _next();
  @override
  Future<ConsultReply> selectSlot(String runId, String slotId) async => _next();
  @override
  Future<ConsultReply> getConsult(String runId) async => _next();
  @override
  Future<ConsultReply> uploadFile(String runId, File file, String filename) async => _next();
  @override
  Future<Map<String, dynamic>> respond(String appointmentId, String action) async => {'ok': true};
}

ConsultReply reply(Map<String, dynamic> j) =>
    ConsultReply.fromJson({'runId': 'r1', 'node': 'intake', 'status': 'active', 'reply': '', ...j});

void main() {
  late FakeEngineClient engine;
  late ChatProvider chat;

  setUp(() {
    engine = FakeEngineClient();
    chat = ChatProvider(engineClient: engine, userId: 'u1');
  });

  test('startConversation shows the engine greeting and enters chatting', () async {
    engine.queue.add(reply({'reply': 'Hello! I am your AppointMed health assistant.'}));
    await chat.startConversation();
    expect(chat.state, ChatState.chatting);
    expect(chat.messages.single.text, contains('AppointMed'));
    expect(chat.messages.single.isUser, isFalse);
  });

  test('slotOptions from the engine switch to showingSlots with a slot picker message', () async {
    engine.queue.add(reply({'reply': 'hi'}));
    await chat.startConversation();
    engine.queue.add(reply({
      'node': 'match', 'reply': 'Here are the best available slots:',
      'slotOptions': [
        {'id': 's1', 'specialistId': 'sp1', 'specialistName': 'Dr. A', 'specialty': 'Cardiology',
         'startsAt': '2026-07-03T01:00:00.000Z', 'endsAt': '2026-07-03T01:30:00.000Z',
         'price': 150, 'hospitalId': 'h1', 'hospitalName': 'KL Medical Center', 'hospitalAddress': 'x'}
      ],
    }));
    await chat.sendMessage('budget 200, any hospital, morning');
    expect(chat.state, ChatState.showingSlots);
    expect(chat.messages.last.type, ChatMessageType.slotPicker);
    expect(chat.messages.last.slots!.single.specialistName, 'Dr. A');
  });

  test('selectSlot lands in waitingHospital with a pending-request card', () async {
    engine.queue.add(reply({'reply': 'hi'}));
    await chat.startConversation();
    // Drive to showingSlots first — selectSlot's guard requires it (mirrors test #2 and the real flow).
    engine.queue.add(reply({
      'node': 'match', 'reply': 'Here are the best available slots:',
      'slotOptions': [
        {'id': 's1', 'specialistId': 'sp1', 'specialistName': 'Dr. A', 'specialty': 'Cardiology',
         'startsAt': '2026-07-03T01:00:00.000Z', 'endsAt': '2026-07-03T01:30:00.000Z',
         'price': 150, 'hospitalId': 'h1', 'hospitalName': 'KL Medical Center', 'hospitalAddress': 'x'}
      ],
    }));
    await chat.sendMessage('any time');
    // Now select the slot — the engine returns the pending-appointment envelope.
    engine.queue.add(reply({
      'node': 'hospital_review', 'status': 'waiting_hospital',
      'reply': 'Your booking request is in! It is now pending hospital confirmation.',
      'appointment': {'id': 'a1', 'status': 'pending', 'startsAt': '2026-07-03T01:00:00.000Z',
        'hospitalName': 'KL Medical Center', 'specialistName': 'Dr. A', 'specialty': 'Cardiology', 'price': 150},
    }));
    final slot = SlotModelFixture.any();
    await chat.selectSlot(slot);
    expect(chat.state, ChatState.waitingHospital);
    expect(chat.messages.last.type, ChatMessageType.confirmation);
  });

  test('escalation disables the flow', () async {
    engine.queue.add(reply({'reply': 'hi'}));
    await chat.startConversation();
    engine.queue.add(reply({'status': 'escalated', 'escalated': true, 'reply': 'Please call 999 now.'}));
    await chat.sendMessage('crushing chest pain');
    expect(chat.state, ChatState.escalated);
    expect(chat.messages.last.text, contains('999'));
  });

  test('an escalated reply that also carries slotOptions still escalates (defense-in-depth)', () async {
    engine.queue.add(reply({'reply': 'hi'}));
    await chat.startConversation();
    engine.queue.add(reply({
      'status': 'escalated', 'escalated': true, 'reply': 'Please call 999 now.',
      'slotOptions': [
        {'id': 's1', 'specialistId': 'sp1', 'specialistName': 'Dr. A', 'specialty': 'Cardiology',
         'startsAt': '2026-07-03T01:00:00.000Z', 'endsAt': '2026-07-03T01:30:00.000Z',
         'price': 150, 'hospitalId': 'h1', 'hospitalName': 'KL Medical Center', 'hospitalAddress': 'x'}
      ],
    }));
    await chat.sendMessage('crushing chest pain while viewing slots');
    expect(chat.state, ChatState.escalated);
    expect(chat.messages.any((m) => m.type == ChatMessageType.slotPicker), isFalse);
  });
}

class SlotModelFixture {
  static SlotModel any() => SlotModel(
        id: 's1', hospitalId: 'h1', hospitalName: 'KL Medical Center', hospitalAddress: 'x',
        specialistId: 'sp1', specialistName: 'Dr. A', specialty: 'Cardiology',
        dateTime: DateTime.utc(2026, 7, 3, 1), price: 150);
}
