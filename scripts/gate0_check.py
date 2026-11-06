#!/usr/bin/env python3
"""Gate 0：验证 pyseekdb 嵌入式读写 + 全文/向量混合检索。

用法：
    qoder/.venv/bin/python qoder/scripts/gate0_check.py
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pyseekdb
from pyseekdb import FulltextIndexConfig, HNSWConfiguration, Schema, VectorIndexConfig

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.backend.embedding import DEFAULT_DIM, HashEmbedding  # noqa: E402

DATA_DIR = ROOT / "data" / "gate0" / "seekdb"


def main() -> int:
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)

    print(f"[1] open embedded seekdb: {DATA_DIR}")
    admin = pyseekdb.AdminClient(path=str(DATA_DIR))
    admin.create_database("gapcoach")
    print(f"    databases: {sorted({db.name for db in admin.list_databases()})}")
    client = pyseekdb.Client(path=str(DATA_DIR), database="gapcoach")

    print("[2] create collection with HNSW vector + IK fulltext index")
    name = "gate0_materials"
    coll = client.create_collection(
        name=name,
        schema=Schema(
            vector_index=VectorIndexConfig(
                hnsw=HNSWConfiguration(dimension=DEFAULT_DIM, distance="cosine"),
                embedding_function=HashEmbedding(),
            ),
            fulltext_index=FulltextIndexConfig(analyzer="ik"),
        ),
    )
    print(f"    created: {coll.name} dim={coll.dimension}")

    docs = [
        (
            "m1",
            "事务的 ACID 特性：原子性、一致性、隔离性、持久性。隔离级别包括读未提交、读已提交、可重复读和串行化。",
            {"course_id": "db-intro", "kp_id": "kp-transaction"},
        ),
        (
            "m2",
            "B+ 树索引适合范围查询，叶子节点通过链表相连。联合索引遵循最左前缀原则。",
            {"course_id": "db-intro", "kp_id": "kp-index"},
        ),
        (
            "m3",
            "两阶段锁协议与 MVCC 是常见的并发控制手段。幻读问题通常通过间隙锁解决。",
            {"course_id": "db-intro", "kp_id": "kp-concurrency"},
        ),
        (
            "m4",
            "Raft 通过领导者选举和日志复制保证分布式一致性，多数派确认后才提交。",
            {"course_id": "db-intro", "kp_id": "kp-distributed"},
        ),
    ]
    coll.add(
        ids=[d[0] for d in docs],
        documents=[d[1] for d in docs],
        metadatas=[d[2] for d in docs],
    )
    coll.refresh_index()
    print(f"    count={coll.count()} vector_index={coll.has_vector_index}")

    print("[3] vector query: 隔离级别和幻读")
    res = coll.query(
        query_texts=["隔离级别和幻读"],
        n_results=2,
        include=["documents", "metadatas", "distances"],
    )
    for i, doc_id in enumerate(res["ids"][0]):
        print(f"    {doc_id} dist={res['distances'][0][i]:.4f} {res['documents'][0][i][:28]}...")
    assert res["ids"][0][0] in {"m1", "m3"}, "向量检索未命中事务/并发材料"

    print("[4] metadata filter query")
    res = coll.query(
        query_texts=["索引"],
        n_results=3,
        where={"kp_id": {"$eq": "kp-index"}},
        include=["documents", "metadatas"],
    )
    print(f"    filtered ids={res['ids'][0]}")
    assert res["ids"][0] == ["m2"], "元数据过滤结果异常"

    print("[5] hybrid search: fulltext + vector + rrf")
    res = coll.hybrid_search(
        query={"where_document": {"$contains": "索引"}, "n_results": 3},
        knn={"query_texts": ["最左前缀 范围查询"], "n_results": 3},
        rank={"rrf": {"rank_window_size": 10}},
        n_results=3,
        include=["documents", "metadatas", "distances"],
    )
    ids = res["ids"][0]
    print(f"    hybrid ids={ids}")
    print(f"    first={res['documents'][0][0][:40]}...")
    assert "m2" in ids, "混合检索未召回 B+ 树材料"

    print("[6] reopen same path (persistence + embedding registry)")
    client2 = pyseekdb.Client(path=str(DATA_DIR), database="gapcoach")
    coll2 = client2.get_collection("gate0_materials")
    print(f"    count after reopen={coll2.count()}")
    assert coll2.count() == len(docs)

    print("\nGATE0-SEEKDB: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
