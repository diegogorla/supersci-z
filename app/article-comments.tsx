"use client";

import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "./content-public";
import type { PublicArticleComment } from "@/lib/account/comments";

const labels: Record<Locale, { title: string; empty: string; placeholder: string; send: string; signIn: string; pending: string; error: string }> = {
  pt: { title: "Comentários", empty: "Ainda não há comentários publicados.", placeholder: "Contribua com uma observação clara e relacionada à matéria.", send: "Enviar para moderação", signIn: "Entre com uma assinatura para comentar.", pending: "Comentário recebido e enviado para moderação.", error: "Não foi possível enviar o comentário." },
  en: { title: "Comments", empty: "No comments have been published yet.", placeholder: "Add a clear observation related to the story.", send: "Send for review", signIn: "Sign in with a subscription to comment.", pending: "Comment received and sent for moderation.", error: "The comment could not be sent." },
  es: { title: "Comentarios", empty: "Aún no hay comentarios publicados.", placeholder: "Añada una observación clara relacionada con el artículo.", send: "Enviar a moderación", signIn: "Inicie sesión con una suscripción para comentar.", pending: "Comentario recibido y enviado a moderación.", error: "No fue posible enviar el comentario." },
  zh: { title: "评论", empty: "尚无已发布评论。", placeholder: "请提交与文章相关的清晰观点。", send: "提交审核", signIn: "订阅并登录后即可评论。", pending: "评论已收到，正在等待审核。", error: "无法提交评论。" },
  hi: { title: "टिप्पणियाँ", empty: "अभी कोई प्रकाशित टिप्पणी नहीं है।", placeholder: "लेख से जुड़ी स्पष्ट टिप्पणी लिखें।", send: "समीक्षा के लिए भेजें", signIn: "टिप्पणी के लिए सदस्यता खाते से प्रवेश करें।", pending: "टिप्पणी समीक्षा के लिए भेज दी गई है।", error: "टिप्पणी भेजी नहीं जा सकी।" },
  ja: { title: "コメント", empty: "公開済みのコメントはまだありません。", placeholder: "記事に関係する明確な意見をお寄せください。", send: "審査に送る", signIn: "購読アカウントでログインするとコメントできます。", pending: "コメントを受け付け、審査に送りました。", error: "コメントを送信できませんでした。" },
  ru: { title: "Комментарии", empty: "Опубликованных комментариев пока нет.", placeholder: "Оставьте ясное замечание по теме материала.", send: "Отправить на модерацию", signIn: "Войдите с подпиской, чтобы комментировать.", pending: "Комментарий получен и отправлен на модерацию.", error: "Не удалось отправить комментарий." },
};

// Private links use full document navigation to unload analytics before authentication.
export function ArticleComments({ articleSlug, locale, comments, canComment, preview = false }: { articleSlug: string; locale: Locale; comments: PublicArticleComment[]; canComment: boolean; preview?: boolean }) {
  const copy = labels[locale];
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    const response = await fetch("/api/account/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleSlug, body }) });
    setMessage(response.ok ? copy.pending : copy.error);
    if (response.ok) setBody("");
    setBusy(false);
  }

  return <section className="article-comments" aria-labelledby="comments-title"><div className="comments-heading"><MessageCircle /><h2 id="comments-title">{copy.title}</h2></div>{comments.length === 0 ? <p>{copy.empty}</p> : <div className="comment-list">{comments.map((comment, index) => <article key={`${comment.createdAt}-${index}`}><strong>{comment.author}</strong><p>{comment.body}</p><small>{new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "medium" }).format(new Date(comment.createdAt))}</small></article>)}</div>}{canComment ? <form onSubmit={submit}>{preview && <p>Formulário demonstrativo. Volte ao modo proprietário para enviar um comentário.</p>}<textarea disabled={preview} required minLength={3} maxLength={1500} placeholder={copy.placeholder} value={body} onChange={(event) => setBody(event.target.value)} /><Button disabled={preview || busy || body.trim().length < 3}><Send size={16} /> {copy.send}</Button></form> : <a className="read-link" href={`/entrar?next=${encodeURIComponent(`/artigo/${articleSlug}?lang=${locale}`)}`}>{copy.signIn}</a>}{message && <p className="auth-message" role="status">{message}</p>}</section>;
}
