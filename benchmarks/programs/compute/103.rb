n=STDIN.read.to_i
s=0; m=4294967291
(1..n).each { |i| s=(s*1000003+i)%m }
puts s
