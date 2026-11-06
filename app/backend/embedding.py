"""本地确定性文本向量。

设计目标：
- 完全离线、零下载、可复现，适合比赛演示与自动化测试；
- 对中文友好：使用字符 unigram + bigram 做特征哈希（类似 HashingVectorizer）；
- 与 seekdb 的全文检索（IK 分词 + BM25）形成互补，而不是重复。

后续如果要换成 bge-small-zh 等模型，只需实现同样的
`__call__ / get_config / build_from_config / name` 接口，
并把 `EMBEDDING_BACKEND` 切到新的实现。
"""

from __future__ import annotations

import hashlib
import math

from pyseekdb import register_embedding_function

DEFAULT_DIM = 384


def _tokens(text: str) -> list[str]:
    text = (text or "").lower()
    chars = [c for c in text if not c.isspace()]
    grams = list(chars)
    grams += ["".join(chars[i : i + 2]) for i in range(len(chars) - 1)]

    words: list[str] = []
    buf = ""
    for c in text:
        if c.isascii() and c.isalnum():
            buf += c
        elif buf:
            words.append(buf)
            buf = ""
    if buf:
        words.append(buf)
    return grams + words


@register_embedding_function
class HashEmbedding:
    """字符 n-gram 特征哈希向量，L2 归一化。"""

    def __init__(self, dim: int = DEFAULT_DIM) -> None:
        self._dim = int(dim)

    @staticmethod
    def name() -> str:
        return "gapcoach-hash-v1"

    @property
    def dimension(self) -> int:
        return self._dim

    def __call__(self, documents):
        single = isinstance(documents, str)
        docs = [documents] if single else list(documents)
        out: list[list[float]] = []
        for doc in docs:
            vec = [0.0] * self._dim
            for tok in _tokens(doc):
                digest = hashlib.blake2b(tok.encode("utf-8"), digest_size=8).digest()
                idx = int.from_bytes(digest[:4], "big") % self._dim
                sign = 1.0 if digest[4] & 1 else -1.0
                vec[idx] += sign
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out

    def get_config(self) -> dict:
        return {"dim": self._dim}

    @staticmethod
    def build_from_config(config: dict) -> "HashEmbedding":
        return HashEmbedding(int(config.get("dim", DEFAULT_DIM)))
