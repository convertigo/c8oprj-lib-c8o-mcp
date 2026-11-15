# Multipart email example and iterator conditions

Read when: Multipart email example and iterator conditions. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/schema-learning-when-mapping-matters`. Next: `convertigo://guides/backend/schema-learning-when-mapping-matters-3`.

---

The step below sends a `multipart/alternative` message in UTF-8 and catches the error with short connection timeouts: `mailResult` is `{ok: true}`, or `{ok: false, error}` with the cause (`Could not connect to SMTP host: <host>, port: <port> | Connection refused` for an unreachable relay, `Unknown SMTP host: <host>` for a wrong name). Its `MailcapCommandMap` gives JavaMail the content handlers the engine does not find by itself: without it the send fails with `IOException while sending message` (`no object DCH for MIME type multipart/alternative`). Give it to the message and its parts as below; never call `javax.activation.CommandMap.setDefaultCommandMap`, which changes the default of the whole JVM, so of every project of the Studio or server.

```js
mailResult = { ok: false, error: "" };
try {
  var props = new java.util.Properties();
  props.put("mail.smtp.host", host); props.put("mail.smtp.port", port);
  props.put("mail.smtp.connectiontimeout", "5000"); props.put("mail.smtp.timeout", "10000");
  var session = javax.mail.Session.getInstance(props);
  var msg = new javax.mail.internet.MimeMessage(session);
  msg.setFrom(new javax.mail.internet.InternetAddress(String(sender)));
  msg.setRecipients(java.lang.Class.forName("javax.mail.Message$RecipientType").getField("TO").get(null),
    javax.mail.internet.InternetAddress.parse(String(to)));
  msg.setSubject(String(subject), "UTF-8");
  var mailcap = new javax.activation.MailcapCommandMap();
  mailcap.addMailcap("text/plain;; x-java-content-handler=com.sun.mail.handlers.text_plain");
  mailcap.addMailcap("text/html;; x-java-content-handler=com.sun.mail.handlers.text_html");
  mailcap.addMailcap("multipart/*;; x-java-content-handler=com.sun.mail.handlers.multipart_mixed");
  var textPart = new javax.mail.internet.MimeBodyPart();
  textPart.setText(String(body), "UTF-8");
  var htmlPart = new javax.mail.internet.MimeBodyPart();
  htmlPart.setContent(String(bodyHtml), "text/html; charset=UTF-8");
  var multipart = new javax.mail.internet.MimeMultipart("alternative");
  multipart.addBodyPart(textPart); // plain text first, HTML last: the client shows the last one it can
  multipart.addBodyPart(htmlPart);
  msg.setContent(multipart);
  [msg, textPart, htmlPart].forEach(function (part) { part.getDataHandler().setCommandMap(mailcap); });
  javax.mail.Transport.send(msg);
  mailResult.ok = true;
} catch (e) {
  var cause = e && e.javaException ? e.javaException : e;
  var reasons = [];
  for (var c = cause, n = 0; c && n < 4; n++) {
    reasons.push(String(c.getMessage ? c.getMessage() : c));
    c = c.getNextException ? c.getNextException() : (c.getCause ? c.getCause() : null);
  }
  mailResult.error = reasons.join(" | ").substring(0, 400);
}
```

Escape the values you put in `bodyHtml`. Checked on Studio 8.4.7: against a local SMTP server the message arrives as `multipart/alternative` with both parts in UTF-8 (accented subject and bodies) and the JVM default is left as it was; against a closed port or an unknown host it answers `ok: false` with the cause.

### `IteratorStep.condition` semantics
`IteratorStep.condition` is not a free-form prose flag. Treat it as a normal conditional expression evaluated at runtime.

Use it when:
- you already have an iterator source
- you need to skip some candidate items without changing the source itself

Keep it simple:
- the condition must evaluate to a boolean-like result
- use one explicit JS expression when you need computed logic
- leave it empty when every iterated item should pass

Valid patterns:
- `item != null`
- `String(item).length > 0`
- `vars.enabled == "true"`

Invalid patterns:
- raw XPath fragments without a boolean expression
- comma-joined source tokens
- human prose such as `only when not empty`
- copied `sourceDefinition` arrays or JSON objects placed into `condition`

Rule of thumb:
- `sourceDefinition` chooses **what** you iterate
- `condition` decides **whether the current iterated item continues**

If you are not sure:
1. prove the iterator source first
2. start with no condition
