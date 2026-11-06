# 知隙项目站

这是「知隙 GapCoach」的 Qoder Sites 项目网站源文件：单页静态站，无构建步骤。

**已发布：<https://gapcoach-2pf0jobp824.qoder.zone>**（公开，无需登录）。

## 本地预览

```bash
cd qoder/site
python3 -m http.server 4173
# 打开 http://127.0.0.1:4173
```

## 内容来源

- `assets/img/`：真实运行截图，由 1024 / 1440 宽度浏览器直出；未使用生成图代替界面。
- `assets/evidence/verify.json`：`scripts/verify.py` 一次 20/20 PASS 的公开摘录，已去掉本机绝对路径。
- 技术数字与规则以 `app/backend/` 与 `README.md` 为准。

## 发布

站点通过 Qoder Sites 发布：`projectRoot` 指向本目录，`webDirectory` 为 `dist`。`dist/` 是上传用的静态副本，由 `scripts/build_site.sh` 生成；源文件仍是本目录。

更新内容后：

```bash
./scripts/build_site.sh
```

然后使用 Qoder Sites 的 `prepare_site` / `publish_site` 重新发布。站点在评审结束前保持公开，不暂停、不删除。

## 说明

- 公开站是项目说明与真实运行截图；完整应用需要按根目录 `README.md` 在本地启动（嵌入式 seekdb + 本地 PowerContext）。
- 站点不收集访问者个人信息，不接入第三方统计。
