// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { View, Text, Pressable, Image, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../theme.js';
import { useAuth } from '../auth.js';
import { api } from '../api.js';
import { openLink } from '../openLink.js';
import { GradientButton } from '../ui.js';
import { t as tr } from '../i18n/index.js';

const KNOWN_ERRORS = ['invalid_email', 'weak_password', 'email_taken', 'not_verified', 'invalid_credentials'];

export default function LoginScreen() {
  const t = useTheme();
  const { demoMode, busy, loginDemo, loginEmail, loginBattlenet } = useAuth();

  // E-mail demo account, as on the web: register → confirm by mail → sign in.
  const [mode, setMode] = useState('register'); // 'register' | 'login'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text, link? }

  const switchMode = (m) => { setMode(m); setMsg(null); };
  const blocked = sending || busy || !email || !password;

  const submit = async () => {
    if (blocked) return;
    setSending(true); setMsg(null);
    try {
      if (mode === 'register') {
        const r = await api.register(email.trim(), password);
        setMsg({ ok: true, text: tr(r.mailed ? 'login.mailed' : 'login.notMailed'), link: r.verifyUrl });
        setMode('login');
      } else {
        await loginEmail(email.trim(), password);
      }
    } catch (err) {
      setMsg({ ok: false, text: tr(KNOWN_ERRORS.includes(err.message) ? `login.err.${err.message}` : 'login.err.generic') });
    } finally {
      setSending(false);
    }
  };

  const input = { borderColor: t.borderStrong, borderWidth: 1, borderRadius: 11, backgroundColor: t.surface,
    color: t.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, fontFamily: t.body, width: '100%' };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}
        keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/login-logo.png')} style={{ width: 132, height: 132, marginBottom: 14 }} resizeMode="contain" />
        <Text style={{ color: t.text, fontSize: 40, fontFamily: t.black, letterSpacing: 4, textShadowColor: 'rgba(34,230,255,0.35)', textShadowRadius: 16 }}>RAIDEX</Text>
        <Text style={{ color: t.textMuted, marginTop: 8, fontSize: 13, fontFamily: t.mono, letterSpacing: 1.5, textTransform: 'uppercase' }}>{tr('login.tagline')}</Text>

        <View style={{ width: '100%', marginTop: 36 }}>
          <GradientButton onPress={loginBattlenet} busy={busy}>{tr('login.battlenet')}</GradientButton>
        </View>

        {demoMode && (
          <Pressable onPress={loginDemo} disabled={busy}
            style={{ borderColor: t.borderStrong, borderWidth: 1, paddingVertical: 14, borderRadius: 11, marginTop: 16, width: '100%', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontFamily: t.bold, fontSize: 14, letterSpacing: 0.6 }}>{tr('login.demo')}</Text>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', marginTop: 24, marginBottom: 6 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
          <Text style={{ color: t.textFaint, fontSize: 11, fontFamily: t.mono, letterSpacing: 1 }}>{tr('login.orDemo')}</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
        </View>
        <Text style={{ color: t.textMuted, fontSize: 12, fontFamily: t.mono, marginBottom: 14 }}>{tr('login.demoBadge')}</Text>

        {msg && (
          <View style={{ width: '100%', borderColor: msg.ok ? t.green : t.red, borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 12 }}>
            <Text style={{ color: msg.ok ? t.green : t.red, fontFamily: t.body, fontSize: 13 }}>{msg.text}</Text>
            {msg.link ? (
              <Pressable onPress={() => openLink(msg.link)} hitSlop={6} style={{ marginTop: 6 }}>
                <Text style={{ color: t.cyan, fontFamily: t.bodySemi, fontSize: 13 }}>{tr('login.confirmMail')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <TextInput value={email} onChangeText={setEmail} placeholder={tr('login.email')} placeholderTextColor={t.textFaint}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
          style={[input, { marginBottom: 10 }]} />
        <TextInput value={password} onChangeText={setPassword} placeholder={tr('login.password')} placeholderTextColor={t.textFaint}
          secureTextEntry autoCapitalize="none" autoCorrect={false}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          textContentType={mode === 'register' ? 'newPassword' : 'password'}
          onSubmitEditing={submit} returnKeyType="go" style={[input, { marginBottom: 12 }]} />

        <Pressable onPress={submit} disabled={blocked}
          style={{ borderColor: t.borderStrong, borderWidth: 1, paddingVertical: 14, borderRadius: 11, width: '100%', alignItems: 'center', opacity: blocked ? 0.5 : 1 }}>
          <Text style={{ color: t.text, fontFamily: t.bold, fontSize: 14, letterSpacing: 0.6 }}>
            {tr(mode === 'register' ? 'login.createDemo' : 'login.signInDemo')}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
          <Text style={{ color: t.textMuted, fontFamily: t.body, fontSize: 13 }}>{tr(mode === 'register' ? 'login.haveDemo' : 'login.newHere')}</Text>
          <Pressable onPress={() => switchMode(mode === 'register' ? 'login' : 'register')} hitSlop={8}>
            <Text style={{ color: t.cyan, fontFamily: t.bodySemi, fontSize: 13 }}>{tr(mode === 'register' ? 'login.toSignIn' : 'login.toCreate')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
