#lang racket
(define n (string->number (string-trim (read-line))))
(define m 4294967291)
(let loop ([i 1] [s 0])
  (if (> i n)
      (printf "~a\n" s)
      (loop (+ i 1) (modulo (+ (* s 1000003) i) m))))
