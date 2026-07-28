import 'package:flutter_test/flutter_test.dart';
import 'package:appointmed_mobile/models/engine_models.dart';

void main() {
  test('ConsultReply parses a full envelope', () {
    final reply = ConsultReply.fromJson({
      'runId': 'r1', 'node': 'match', 'status': 'active', 'reply': 'Here are slots:',
      'verdict': {'specialty': 'Cardiology', 'urgency': 'week', 'explanation': 'why'},
      'slotOptions': [
        {'id': 's1', 'specialistId': 'sp1', 'specialistName': 'Dr. A', 'specialty': 'Cardiology',
         'startsAt': '2026-07-03T01:00:00.000Z', 'endsAt': '2026-07-03T01:30:00.000Z',
         'price': 150, 'hospitalId': 'h1', 'hospitalName': 'KL Medical Center',
         'hospitalAddress': '123 Jalan Tun Razak'}
      ],
    });
    expect(reply.node, 'match');
    expect(reply.verdict!.specialty, 'Cardiology');
    expect(reply.slotOptions!.single.price, 150);
    expect(reply.slotOptions!.single.hospitalName, 'KL Medical Center');
  });

  test('ConsultReply tolerates minimal envelopes', () {
    final reply = ConsultReply.fromJson({'runId': 'r1', 'node': 'intake', 'status': 'active', 'reply': 'hi'});
    expect(reply.verdict, isNull);
    expect(reply.slotOptions, isNull);
    expect(reply.escalated, isFalse);
  });
}
