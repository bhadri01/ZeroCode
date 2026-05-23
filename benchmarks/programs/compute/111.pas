var n, s, i, m: Int64;
begin
  readln(n);
  s := 0; m := 4294967291;
  for i := 1 to n do
    s := (s * 1000003 + i) mod m;
  writeln(s);
end.
