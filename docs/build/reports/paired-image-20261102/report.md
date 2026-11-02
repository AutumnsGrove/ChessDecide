# Paired position test: board picture added to clean / hinted

200 positions · Stockfish depth 14 · 12800 calls (0 failed) · spent $0.733
Metric: **win-probability loss** per move in percentage points (lower is better) vs Stockfish's best; uniform random mover ≈ 14.8.
Δ = with picture − without, paired by position; 95 % CI by bootstrap over positions. Negative Δ means the picture helped.

## clean → clean_image

| model | n | loss without | loss with | Δ loss (95 % CI) | Δ best-move % | Δ blunder % | same pick % |
|---|---:|---:|---:|---|---:|---:|---:|
| typesafe/jev-1.13 | 200 | 15.3 | 13.9 | **-1.4** [-3.6, +0.5] | +1.5 | -1.0 | 78 |
| baseten/mammoth-1 | 200 | 9.2 | 8.1 | **-1.0** [-2.5, +0.0] | +2.0 | -1.5 | 81 |
| cloudflare/clef | 200 | 9.9 | 8.9 | **-0.9** [-2.5, +0.4] | +2.5 | -1.0 | 65 |
| openai/gpt-6-luna-decisions | 200 | 14.2 | 13.5 | **-0.7** [-3.8, +2.1] | -1.5 | +0.5 | 47 |
| baseten/elephant-1 | 200 | 10.9 | 10.8 | **-0.2** [-1.4, +0.9] | +0.0 | +0.5 | 80 |
| nace-ai/drex-max | 200 | 9.7 | 9.7 | **+0.0** [-1.7, +1.9] | +1.5 | +0.5 | 62 |
| liquid/d1 | 200 | 10.8 | 10.9 | **+0.1** [-1.9, +2.1] | +0.5 | +1.0 | 59 |
| baseten/joey-1 | 200 | 10.2 | 10.4 | **+0.1** [-1.4, +1.6] | -1.0 | +0.0 | 70 |
| cloudflare/clef-omni | 200 | 11.2 | 11.6 | **+0.3** [-0.0, +1.0] | -0.5 | +1.0 | 89 |
| perplexity/pplx-decider-flash-v1.2 | 200 | 12.7 | 13.3 | **+0.6** [-1.9, +2.9] | +0.5 | +1.5 | 67 |
| liquid/d1.1 | 200 | 11.4 | 12.8 | **+1.4** [-1.0, +4.1] | +0.5 | +0.5 | 52 |
| liquid/d1-ultra | 200 | 9.6 | 11.0 | **+1.5** [-0.7, +3.8] | -2.0 | +1.5 | 66 |
| typesafe/jev-1.14 | 200 | 12.9 | 14.5 | **+1.6** [-1.2, +4.6] | -2.5 | +2.0 | 63 |
| perplexity/pplx-decider-v1.2 | 200 | 9.6 | 11.3 | **+1.7** [-0.6, +4.4] | -1.0 | +0.5 | 74 |
| respan/span-02 | 200 | 12.4 | 14.2 | **+1.7** [-0.8, +4.5] | -1.0 | +1.5 | 56 |
| inception/mercury-decide | 200 | 14.4 | 16.5 | **+2.1** [+0.5, +4.1] ▼ hurts | -2.5 | +2.5 | 65 |

**Pooled over 16 models** (positions where all have answers, n=200): Δ loss +0.4 [-0.1, +1.0]

## hinted → hinted_image

| model | n | loss without | loss with | Δ loss (95 % CI) | Δ best-move % | Δ blunder % | same pick % |
|---|---:|---:|---:|---|---:|---:|---:|
| respan/span-02 | 200 | 12.0 | 10.9 | **-1.2** [-2.9, +0.4] | +2.0 | -1.0 | 72 |
| inception/mercury-decide | 200 | 9.8 | 9.2 | **-0.6** [-2.3, +0.7] | +1.0 | +0.0 | 78 |
| baseten/joey-1 | 200 | 13.7 | 13.1 | **-0.6** [-1.7, +0.4] | +0.5 | -1.0 | 91 |
| liquid/d1 | 200 | 9.7 | 9.2 | **-0.5** [-2.0, +0.9] | +0.5 | -1.5 | 75 |
| baseten/elephant-1 | 200 | 9.0 | 8.6 | **-0.4** [-2.0, +1.0] | +0.5 | -1.5 | 89 |
| perplexity/pplx-decider-v1.2 | 200 | 7.0 | 6.8 | **-0.3** [-0.8, +0.1] | +0.0 | -1.0 | 83 |
| cloudflare/clef-omni | 200 | 9.9 | 9.9 | **-0.1** [-1.7, +1.6] | -1.0 | -0.5 | 89 |
| typesafe/jev-1.13 | 200 | 12.2 | 12.2 | **-0.0** [-1.2, +1.4] | -1.0 | -0.5 | 87 |
| cloudflare/clef | 200 | 8.3 | 8.7 | **+0.4** [-0.4, +1.1] | -1.5 | +1.0 | 87 |
| nace-ai/drex-max | 200 | 7.7 | 8.1 | **+0.4** [-1.3, +2.1] | -0.5 | +0.5 | 73 |
| liquid/d1.1 | 200 | 11.9 | 12.3 | **+0.5** [-2.0, +3.0] | -2.0 | +2.0 | 63 |
| baseten/mammoth-1 | 200 | 7.0 | 7.6 | **+0.6** [-0.5, +1.8] | -1.5 | +1.0 | 89 |
| openai/gpt-6-luna-decisions | 200 | 10.9 | 11.8 | **+0.9** [-1.1, +2.9] | -1.0 | +1.0 | 64 |
| perplexity/pplx-decider-flash-v1.2 | 200 | 9.9 | 10.9 | **+0.9** [-0.8, +2.9] | +1.5 | +0.5 | 75 |
| typesafe/jev-1.14 | 200 | 11.1 | 12.3 | **+1.2** [-0.6, +3.3] | -0.5 | +0.5 | 78 |
| liquid/d1-ultra | 200 | 9.7 | 11.9 | **+2.2** [+0.4, +4.3] ▼ hurts | -3.0 | +2.5 | 69 |

**Pooled over 16 models** (positions where all have answers, n=200): Δ loss +0.2 [-0.2, +0.6]

## Cost and size of the picture

| model | arm | mean input tok | mean $/call |
|---|---|---:|---:|
| typesafe/jev-1.14 | clean | 1102 | 0.000046 |
| typesafe/jev-1.14 | clean_image | 1876 | 0.000079 |
| typesafe/jev-1.14 | hinted | 1066 | 0.000045 |
| typesafe/jev-1.14 | hinted_image | 1839 | 0.000077 |
| baseten/elephant-1 | clean | 733 | 0.000026 |
| baseten/elephant-1 | clean_image | 1071 | 0.000037 |
| baseten/elephant-1 | hinted | 701 | 0.000025 |
| baseten/elephant-1 | hinted_image | 1037 | 0.000036 |
| baseten/mammoth-1 | clean | 733 | 0.000073 |
| baseten/mammoth-1 | clean_image | 1071 | 0.000107 |
| baseten/mammoth-1 | hinted | 701 | 0.000070 |
| baseten/mammoth-1 | hinted_image | 1037 | 0.000104 |
| liquid/d1.1 | clean | 468 | 0.000009 |
| liquid/d1.1 | clean_image | 869 | 0.000017 |
| liquid/d1.1 | hinted | 485 | 0.000010 |
| liquid/d1.1 | hinted_image | 886 | 0.000018 |
| liquid/d1 | clean | 468 | 0.000009 |
| liquid/d1 | clean_image | 869 | 0.000017 |
| liquid/d1 | hinted | 485 | 0.000010 |
| liquid/d1 | hinted_image | 886 | 0.000018 |
| liquid/d1-ultra | clean | 468 | 0.000020 |
| liquid/d1-ultra | clean_image | 869 | 0.000037 |
| liquid/d1-ultra | hinted | 485 | 0.000020 |
| liquid/d1-ultra | hinted_image | 886 | 0.000037 |
| perplexity/pplx-decider-v1.2 | clean | 670 | 0.000013 |
| perplexity/pplx-decider-v1.2 | clean_image | 945 | 0.000019 |
| perplexity/pplx-decider-v1.2 | hinted | 638 | 0.000013 |
| perplexity/pplx-decider-v1.2 | hinted_image | 913 | 0.000018 |
| cloudflare/clef | clean | 1011 | 0.000222 |
| cloudflare/clef | clean_image | 1285 | 0.000308 |
| cloudflare/clef | hinted | 980 | 0.000215 |
| cloudflare/clef | hinted_image | 1254 | 0.000301 |
| nace-ai/drex-max | clean | 673 | 0.000040 |
| nace-ai/drex-max | clean_image | 946 | 0.000057 |
| nace-ai/drex-max | hinted | 641 | 0.000038 |
| nace-ai/drex-max | hinted_image | 914 | 0.000055 |
| cloudflare/clef-omni | clean | 1008 | 0.000151 |
| cloudflare/clef-omni | clean_image | 1282 | 0.000192 |
| cloudflare/clef-omni | hinted | 978 | 0.000147 |
| cloudflare/clef-omni | hinted_image | 1252 | 0.000188 |
| baseten/joey-1 | clean | 733 | 0.000007 |
| baseten/joey-1 | clean_image | 1071 | 0.000011 |
| baseten/joey-1 | hinted | 701 | 0.000007 |
| baseten/joey-1 | hinted_image | 1037 | 0.000010 |
| typesafe/jev-1.13 | clean | 1102 | 0.000046 |
| typesafe/jev-1.13 | clean_image | 1876 | 0.000079 |
| typesafe/jev-1.13 | hinted | 1066 | 0.000045 |
| typesafe/jev-1.13 | hinted_image | 1839 | 0.000077 |
| respan/span-02 | clean | 529 | 0.000005 |
| respan/span-02 | clean_image | 803 | 0.000008 |
| respan/span-02 | hinted | 545 | 0.000005 |
| respan/span-02 | hinted_image | 819 | 0.000008 |
| perplexity/pplx-decider-flash-v1.2 | clean | 670 | 0.000007 |
| perplexity/pplx-decider-flash-v1.2 | clean_image | 945 | 0.000009 |
| perplexity/pplx-decider-flash-v1.2 | hinted | 638 | 0.000006 |
| perplexity/pplx-decider-flash-v1.2 | hinted_image | 913 | 0.000009 |
| inception/mercury-decide | clean | 897 | 0.000018 |
| inception/mercury-decide | clean_image | 1163 | 0.000023 |
| inception/mercury-decide | hinted | 867 | 0.000017 |
| inception/mercury-decide | hinted_image | 1132 | 0.000023 |
| openai/gpt-6-luna-decisions | clean | 674 | 0.000067 |
| openai/gpt-6-luna-decisions | clean_image | 944 | 0.000094 |
| openai/gpt-6-luna-decisions | hinted | 638 | 0.000064 |
| openai/gpt-6-luna-decisions | hinted_image | 908 | 0.000091 |
