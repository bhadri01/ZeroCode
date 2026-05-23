n = STDIN.gets.not_nil!.strip.to_i64
s = 0_i64
m = 4294967291_i64
i = 1_i64
while i <= n
  s = (s * 1000003 + i) % m
  i += 1
end
puts s
