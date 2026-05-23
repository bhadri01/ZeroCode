n = IO.read(:stdio, :line) |> String.trim() |> String.to_integer()
m = 4294967291
s = Enum.reduce(1..n, 0, fn i, acc -> rem(acc * 1000003 + i, m) end)
IO.puts(s)
