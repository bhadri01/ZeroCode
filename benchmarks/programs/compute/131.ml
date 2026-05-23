let () =
  let n = int_of_string (String.trim (input_line stdin)) in
  let m = 4294967291 in
  let s = ref 0 in
  for i = 1 to n do
    s := (!s * 1000003 + i) mod m
  done;
  Printf.printf "%d\n" !s
