-- Responder com IA às respostas dos leads: regista-se na linha do tempo quando
-- a IA escreve uma resposta (o email continua a ser enviado à mão).
alter type public.activity_type add value if not exists 'ai_reply_generated';
