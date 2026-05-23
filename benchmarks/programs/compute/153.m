n = str2double(fgetl(stdin));
m = 4294967291;
s = 0;
for i = 1:n
  s = mod(s * 1000003 + i, m);
end
printf("%.0f\n", s);
