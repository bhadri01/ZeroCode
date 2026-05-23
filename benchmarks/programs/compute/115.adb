with Ada.Text_IO; use Ada.Text_IO;
procedure Main is
   type Big is range 0 .. 2 ** 63 - 1;
   package Big_IO is new Ada.Text_IO.Integer_IO (Big);
   N, S, I, M : Big;
begin
   Big_IO.Get (N);
   S := 0;
   M := 4294967291;
   I := 1;
   while I <= N loop
      S := (S * 1000003 + I) mod M;
      I := I + 1;
   end loop;
   Big_IO.Put (S, Width => 0);
   New_Line;
end Main;
