'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowRight,
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Search,
  Database,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIConfigStore } from '@/lib/store/ai-config';
import { STANDARD_INFO, getStandardLabel, isStandardType, type StandardType } from '@/lib/standards';
import { hasTokenUsage } from '@/lib/token-usage';
import { useTokenUsageStore } from '@/lib/store/token-usage';

interface ImportedDocument {
  id: string;
  name: string;
  type: StandardType;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
}

/** 服务端已持久化的文档 */
interface ServerDocument {
  id: string;
  filename: string;
  title: string;
  type: string;
  importedAt: string;
  chunkCount: number;
}

interface KnowledgeSyncNotice {
  variant: 'default' | 'destructive';
  title: string;
  description: string;
}

const standardEntries: Array<[StandardType, (typeof STANDARD_INFO)[StandardType]]> = [
  ['cpp', STANDARD_INFO.cpp],
  ['java', STANDARD_INFO.java],
  ['csharp', STANDARD_INFO.csharp],
];

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<ImportedDocument[]>([]);
  const [serverDocs, setServerDocs] = useState<ServerDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    content: string;
    score: number;
  }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [syncNotice, setSyncNotice] = useState<KnowledgeSyncNotice | null>(null);
  const [clauseStats, setClauseStats] = useState<Record<string, { categories: number; vulnerabilities: number } | null>>({});
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);
  const uploadedStandardTypes = useMemo(() => {
    const types = new Set<StandardType>();

    for (const doc of serverDocs) {
      if (isStandardType(doc.type)) {
        types.add(doc.type);
      }
    }

    for (const doc of documents) {
      if (doc.status === 'importing' || doc.status === 'success') {
        types.add(doc.type);
      }
    }

    return types;
  }, [documents, serverDocs]);

  // 加载服务端已导入文档列表
  const loadServerDocs = useCallback(async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch('/api/knowledge/documents');
      const data = await res.json();
      if (data.success) {
        setServerDocs(data.documents);
      }
    } catch {
      // 静默失败
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  const loadClauseStats = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/stats');
      const data = await res.json();
      if (data.success) {
        setClauseStats(data.stats);
      }
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    loadServerDocs();
    loadClauseStats();
  }, [loadServerDocs, loadClauseStats]);

  const handleFileUpload = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: StandardType
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (uploadedStandardTypes.has(type)) {
      event.target.value = '';
      return;
    }

    const docId = `doc_${Date.now()}`;
    const docName = file.name;

    // 添加到列表
    setDocuments(prev => [...prev, {
      id: docId,
      name: docName,
      type,
      status: 'importing',
    }]);

    setIsUploading(true);

    try {
      const { getConnectionConfig } = useAIConfigStore.getState();
      const connectionConfig = getConnectionConfig();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', STANDARD_INFO[type].fullName);
      formData.append('type', type);
      formData.append('connectionConfig', JSON.stringify(connectionConfig));

      const response = await fetch('/api/knowledge/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        if (data.usage) {
          if (hasTokenUsage(data.usage)) {
            addUsageRecord({
              feature: 'knowledge',
              action: `导入${STANDARD_INFO[type].name}`,
              ...data.usage,
            });
          }
        }
        setDocuments(prev => prev.map(doc =>
          doc.id === docId
            ? { ...doc, status: 'success' }
            : doc
        ));
        // 刷新服务端文档列表
        loadServerDocs();
        loadClauseStats();
      } else {
        setDocuments(prev => prev.map(doc =>
          doc.id === docId
            ? { ...doc, status: 'error', error: data.error }
            : doc
        ));
      }
    } catch {
      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? { ...doc, status: 'error', error: '上传失败' }
          : doc
      ));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  }, [addUsageRecord, loadClauseStats, loadServerDocs, uploadedStandardTypes]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const { getConnectionConfig } = useAIConfigStore.getState();
      const connectionConfig = getConnectionConfig();

      const response = await fetch(
        `/api/knowledge/search?q=${encodeURIComponent(searchQuery)}&topK=5`,
        {
          headers: {
            'x-connection-config': JSON.stringify(connectionConfig),
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        setSearchResults(data.results);
        if (data.usage) {
          if (hasTokenUsage(data.usage)) {
            addUsageRecord({
              feature: 'knowledge',
              action: `知识库搜索：${searchQuery.trim().slice(0, 12)}`,
              ...data.usage,
            });
          }
        }
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [addUsageRecord, searchQuery]);

  const handleRemoveDoc = useCallback((docId: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== docId));
  }, []);

  const handleDeleteServerDoc = useCallback(async (docId: string) => {
    const targetDoc = serverDocs.find((doc) => doc.id === docId);

    try {
      const res = await fetch(`/api/knowledge/documents?id=${encodeURIComponent(docId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        const nextDocs = serverDocs.filter((doc) => doc.id !== docId);
        setServerDocs(nextDocs);
        setSyncNotice({
          variant: 'default',
          title: '文档已删除，学习中心会按剩余文档动态刷新',
          description: targetDoc
            ? `已移除“${targetDoc.title || targetDoc.filename}”。当前还剩 ${nextDocs.length} 个已存储文档，可直接去学习中心验证。`
            : `删除成功。当前还剩 ${nextDocs.length} 个已存储文档，可直接去学习中心验证。`,
        });
        loadServerDocs();
        loadClauseStats();
      } else {
        setSyncNotice({
          variant: 'destructive',
          title: '删除失败',
          description: data.error || '文档删除没有成功，请稍后重试。',
        });
      }
    } catch {
      setSyncNotice({
        variant: 'destructive',
        title: '删除失败',
        description: '删除请求没有完成，请检查服务状态后重试。',
      });
    }
  }, [loadServerDocs, loadClauseStats, serverDocs]);

  const successCount = documents.filter(d => d.status === 'success').length;
  const totalDocs = documents.length;

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">知识库管理</h1>
              <p className="text-sm text-muted-foreground">
                上传国家标准文档，构建漏洞审计知识库
              </p>
            </div>
          </div>
        </div>

        <Alert className="mb-6 border-sky-500/30 bg-sky-500/5">
          <Users className="h-4 w-4 text-sky-400" />
          <AlertTitle>团队共享知识库</AlertTitle>
          <AlertDescription>
            知识库为所有在线用户共享，上传或删除文档会影响团队中的每个人。建议由专人负责文档管理。
          </AlertDescription>
        </Alert>

        {syncNotice && (
          <Alert variant={syncNotice.variant} className="mb-6 border-primary/20 bg-primary/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{syncNotice.title}</AlertTitle>
            <AlertDescription className="gap-3 sm:flex sm:items-center sm:justify-between">
              <span>{syncNotice.description}</span>
              {syncNotice.variant === 'default' && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href="/learning">
                    去学习中心
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <div className="space-y-6">
            {standardEntries.map(([type, standard]) => (
              <Card key={type}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', standard.accentClassName)}>
                        <FileText className={cn('h-5 w-5', standard.accentTextClassName)} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{standard.name}</CardTitle>
                        <CardDescription className="text-sm">
                          {standard.fullName}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {clauseStats[type]
                        ? `${clauseStats[type]!.categories}大类${clauseStats[type]!.vulnerabilities}种漏洞`
                        : standard.vulnerabilities}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {standard.uploadDescription}
                    </p>
                    {uploadedStandardTypes.has(type) && (
                      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                        当前标准已上传，如需更换文档，请先在下方删除已存储文档。
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        id={`${type}-file`}
                        accept=".pdf,.txt,.md"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, type)}
                        disabled={isUploading || uploadedStandardTypes.has(type)}
                      />
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => document.getElementById(`${type}-file`)?.click()}
                        disabled={isUploading || uploadedStandardTypes.has(type)}
                      >
                        {isUploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {uploadedStandardTypes.has(type) ? '该标准已上传' : standard.uploadLabel}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Imported Documents */}
            {documents.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">已导入文档</CardTitle>
                    <Badge variant="secondary">{successCount}/{totalDocs} 成功</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border',
                          doc.status === 'success' && 'border-green-400/50 bg-green-400/5',
                          doc.status === 'error' && 'border-rose-400/50 bg-rose-400/5',
                          doc.status === 'importing' && 'border-primary/50 bg-primary/5'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {doc.status === 'importing' && (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          )}
                          {doc.status === 'success' && (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          )}
                          {doc.status === 'error' && (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {getStandardLabel(doc.type)}
                              {doc.status === 'importing' && ' - 导入中...'}
                              {doc.status === 'error' && ` - ${doc.error}`}
                            </p>
                          </div>
                        </div>
                        {doc.status !== 'importing' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRemoveDoc(doc.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Search & Test Section */}
          <div className="space-y-6">
            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  知识库搜索
                </CardTitle>
                <CardDescription>
                  测试知识库内容，搜索漏洞相关信息
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="输入关键词搜索..."
                    className="flex-1 px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button onClick={handleSearch} disabled={isSearching}>
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map((result, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 text-sm"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            相关度: {(result.score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="text-muted-foreground line-clamp-3">
                          {result.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage Tips */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground mb-2">使用说明</p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>1. 上传国家标准文档（PDF或文本格式）</li>
                      <li>2. 系统会自动解析并存储到知识库</li>
                      <li>3. 在测评时，AI会基于知识库内容出题</li>
                      <li>4. 上传的文档越完整，生成的题目越专业</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Server Documents */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    已存储文档
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadServerDocs} disabled={isLoadingDocs}>
                    <RefreshCw className={cn('w-4 h-4', isLoadingDocs && 'animate-spin')} />
                  </Button>
                </div>
                <CardDescription>
                  知识库中已持久化的文档（存储在服务端本地）
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingDocs ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    加载中...
                  </div>
                ) : serverDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    暂无文档，上传标准文档后会自动存储到知识库
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serverDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.title || doc.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {isStandardType(doc.type) ? `${getStandardLabel(doc.type)} · ` : ''}{doc.chunkCount} 个文本块 · {new Date(doc.importedAt).toLocaleDateString('zh-CN')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleDeleteServerDoc(doc.id)}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-rose-400" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">知识库状态</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">已存储文档</span>
                      <span className="font-medium">{serverDocs.length} 个</span>
                    </div>
                    <Progress 
                      value={serverDocs.length > 0 ? 100 : 0} 
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">总文本块数</span>
                      <span className="font-medium">
                        {serverDocs.reduce((sum, d) => sum + d.chunkCount, 0)} 个
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
