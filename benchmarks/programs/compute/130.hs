import Data.List (foldl')
main :: IO ()
main = do
  n <- readLn :: IO Int
  let m = 4294967291
      s = foldl' (\acc i -> (acc * 1000003 + i) `mod` m) (0 :: Int) [1..n]
  print s
