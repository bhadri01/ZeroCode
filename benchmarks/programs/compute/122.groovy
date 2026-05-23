def n = System.in.text.trim() as long
long s = 0; long m = 4294967291
for (long i = 1; i <= n; i++) s = (s * 1000003 + i) % m
println s
