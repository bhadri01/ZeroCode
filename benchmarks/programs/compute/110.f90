program hashloop
  integer(8) :: n, s, i, m
  read(*,*) n
  s = 0_8
  m = 4294967291_8
  do i = 1_8, n
    s = mod(s * 1000003_8 + i, m)
  end do
  print '(I0)', s
end program hashloop
