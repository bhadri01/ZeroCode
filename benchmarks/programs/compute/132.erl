-module(main).
-export([main/0]).
main() ->
    {ok, [N]} = io:fread("", "~d"),
    M = 4294967291,
    S = loop(1, N, 0, M),
    io:format("~w~n", [S]).
loop(I, N, S, _M) when I > N -> S;
loop(I, N, S, M) -> loop(I + 1, N, (S * 1000003 + I) rem M, M).
