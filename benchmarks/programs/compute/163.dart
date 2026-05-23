import 'dart:io';
void main() {
  final n = int.parse(stdin.readLineSync()!.trim());
  int s = 0;
  const int m = 4294967291;
  for (int i = 1; i <= n; i++) s = (s * 1000003 + i) % m;
  print(s);
}
