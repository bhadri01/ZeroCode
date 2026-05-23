using System;
class Program {
    static void Main() {
        long n = long.Parse(Console.In.ReadToEnd().Trim());
        long s = 0, m = 4294967291;
        for (long i = 1; i <= n; i++) s = (s * 1000003 + i) % m;
        Console.WriteLine(s);
    }
}
