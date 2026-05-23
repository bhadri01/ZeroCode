(let [n (Long/parseLong (clojure.string/trim (read-line)))
      m 4294967291]
  (loop [i 1 s 0]
    (if (> i n)
      (println s)
      (recur (inc i) (mod (+ (* s 1000003) i) m)))))
