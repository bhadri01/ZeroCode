(let* ((n (read))
       (m 4294967291)
       (s 0))
  (loop for i from 1 to n do
    (setf s (mod (+ (* s 1000003) i) m)))
  (format t "~a~%" s))
