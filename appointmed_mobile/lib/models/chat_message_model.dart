import 'slot_model.dart';

enum ChatMessageType { text, image, document, slotPicker, confirmation }

class ChatMessageModel {
  final String id;
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final ChatMessageType type;
  final List<SlotModel>? slots;
  final SlotModel? confirmedSlot;
  final String? imageUrl;
  final String? fileName;

  const ChatMessageModel({
    required this.id,
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.type = ChatMessageType.text,
    this.slots,
    this.confirmedSlot,
    this.imageUrl,
    this.fileName,
  });

  bool get isSpecial => type != ChatMessageType.text;

  static ChatMessageModel ai(String text) => ChatMessageModel(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: text,
        isUser: false,
        timestamp: DateTime.now(),
      );

  static ChatMessageModel user(String text) => ChatMessageModel(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: text,
        isUser: true,
        timestamp: DateTime.now(),
      );

  static ChatMessageModel image(String url) => ChatMessageModel(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: '',
        isUser: true,
        timestamp: DateTime.now(),
        type: ChatMessageType.image,
        imageUrl: url,
      );

  static ChatMessageModel document(String url, String name) => ChatMessageModel(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: '',
        isUser: true,
        timestamp: DateTime.now(),
        type: ChatMessageType.document,
        imageUrl: url,
        fileName: name,
      );

  static ChatMessageModel slotPicker(List<SlotModel> slots) => ChatMessageModel(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: '',
        isUser: false,
        timestamp: DateTime.now(),
        type: ChatMessageType.slotPicker,
        slots: slots,
      );

  static ChatMessageModel confirmation(SlotModel slot) => ChatMessageModel(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: '',
        isUser: false,
        timestamp: DateTime.now(),
        type: ChatMessageType.confirmation,
        confirmedSlot: slot,
      );
}
