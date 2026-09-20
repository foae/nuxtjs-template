<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

useSeoMeta({ title: 'Dashboard' })

const { user } = useAuthSession()
const verificationSent = ref(false)
const isVerified = computed(() => user.value?.emailVerified ?? false)

const { submit: resendVerification, pending: sendingVerification } = useApiForm(
  '/api/auth/send-verification-email',
  {
    method: 'POST',
    onSuccess: () => {
      verificationSent.value = true
    }
  }
)

async function sendVerificationEmail() {
  if (!user.value) return

  await resendVerification({
    email: user.value.email,
    callbackURL: '/dashboard'
  })
}
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-16">
    <div class="mb-8">
      <p class="text-sm font-medium text-primary">
        Account
      </p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-highlighted">
        Welcome, {{ user?.name }}
      </h1>
      <p class="mt-2 text-muted">
        Your account is ready to use.
      </p>
    </div>

    <UPageCard
      icon="i-lucide-mail-check"
      title="Email confirmation"
      :description="isVerified ? 'Your email address has been confirmed.' : 'Confirm your email to help keep your account secure. Open the link in this signed-in browser; if you cannot sign in, reset your password first.'"
      spotlight
    >
      <template #footer>
        <div class="flex items-center gap-2 text-sm">
          <UBadge
            :color="isVerified ? 'success' : 'warning'"
            variant="subtle"
            :label="isVerified ? 'Confirmed' : 'Confirmation optional'"
          />
          <span class="text-muted">{{ user?.email }}</span>
        </div>

        <UAlert
          v-if="!isVerified && verificationSent"
          class="mt-5"
          color="success"
          variant="subtle"
          title="Confirmation email sent"
          description="Open the link in this signed-in browser. If you cannot sign in, reset your password first. You can continue using your account in the meantime."
        />
        <UButton
          v-if="!isVerified"
          class="mt-5"
          :label="verificationSent ? 'Resend confirmation email' : 'Send confirmation email'"
          icon="i-lucide-send"
          :loading="sendingVerification"
          @click="sendVerificationEmail"
        />
      </template>
    </UPageCard>
  </UContainer>
</template>
