import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/app_config.dart';
import '../models/engine_models.dart';

class EngineException implements Exception {
  final int statusCode;
  final String code;
  EngineException(this.statusCode, this.code);
  @override
  String toString() => 'EngineException($statusCode, $code)';
}

class EngineClient {
  final String baseUrl;
  final String? Function() tokenProvider;
  final http.Client _http;

  EngineClient({String? baseUrl, required this.tokenProvider, http.Client? client})
      : baseUrl = baseUrl ?? AppConfig.engineBaseUrl,
        _http = client ?? http.Client();

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${tokenProvider() ?? ''}',
      };

  Future<Map<String, dynamic>> _decode(http.Response res) async {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw EngineException(res.statusCode, body['error']?.toString() ?? 'engine_error');
    }
    return body;
  }

  Future<ConsultReply> startConsult() async {
    final res = await _http.post(Uri.parse('$baseUrl/consult/start'), headers: _headers, body: '{}');
    return ConsultReply.fromJson(await _decode(res));
  }

  Future<ConsultReply> sendMessage(String runId, String text) async {
    final res = await _http.post(Uri.parse('$baseUrl/consult/$runId/message'),
        headers: _headers, body: jsonEncode({'text': text}));
    return ConsultReply.fromJson(await _decode(res));
  }

  Future<ConsultReply> selectSlot(String runId, String slotId) async {
    final res = await _http.post(Uri.parse('$baseUrl/consult/$runId/select-slot'),
        headers: _headers, body: jsonEncode({'slotId': slotId}));
    return ConsultReply.fromJson(await _decode(res));
  }

  Future<ConsultReply> getConsult(String runId) async {
    final res = await _http.get(Uri.parse('$baseUrl/consult/$runId'), headers: _headers);
    return ConsultReply.fromJson(await _decode(res));
  }

  Future<ConsultReply> uploadFile(String runId, File file, String filename) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/consult/$runId/upload'))
      ..headers['Authorization'] = 'Bearer ${tokenProvider() ?? ''}'
      ..files.add(await http.MultipartFile.fromPath('file', file.path, filename: filename));
    final streamed = await _http.send(req);
    final res = await http.Response.fromStream(streamed);
    return ConsultReply.fromJson(await _decode(res));
  }

  /// action: accept_reschedule | re_match | cancel.
  /// For re_match the returned map is a full ConsultReply envelope.
  Future<Map<String, dynamic>> respond(String appointmentId, String action) async {
    final res = await _http.post(Uri.parse('$baseUrl/appointments/$appointmentId/respond'),
        headers: _headers, body: jsonEncode({'action': action}));
    return _decode(res);
  }
}
