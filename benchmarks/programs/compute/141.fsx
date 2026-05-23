let n = stdin.ReadToEnd().Trim() |> int64
let m = 4294967291L
let mutable s = 0L
for i in 1L .. n do
    s <- (s * 1000003L + i) % m
printfn "%d" s
