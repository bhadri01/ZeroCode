n = parse(Int, strip(readline()))
m = 4294967291
s = 0
for i in 1:n
    global s = (s * 1000003 + i) % m
end
println(s)
