class UserModel {
  final String uid;
  final String fullName;
  final String passport;
  final String phone;
  final String email;
  final String? avatarUrl;
  final DateTime createdAt;

  const UserModel({
    required this.uid,
    required this.fullName,
    required this.passport,
    required this.phone,
    required this.email,
    this.avatarUrl,
    required this.createdAt,
  });

  String get initials {
    final parts = fullName.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty) return parts[0][0].toUpperCase();
    return '?';
  }

  factory UserModel.fromSupabase(Map<String, dynamic> row) {
    return UserModel(
      uid: row['id'],
      fullName: row['full_name'] ?? '',
      passport: row['passport'] ?? '',
      phone: row['phone'] ?? '',
      email: row['email'] ?? '',
      avatarUrl: row['avatar_url'],
      createdAt: DateTime.tryParse(row['created_at'] ?? '') ?? DateTime.now(),
    );
  }

  UserModel copyWith({
    String? fullName,
    String? passport,
    String? phone,
    String? email,
    String? avatarUrl,
  }) {
    return UserModel(
      uid: uid,
      fullName: fullName ?? this.fullName,
      passport: passport ?? this.passport,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      createdAt: createdAt,
    );
  }
}
