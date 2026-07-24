<script setup lang="ts">
/**
 * Create-post form.
 *
 * `:schema="postCreateSchema"` is the same object `server/api/posts/index.post.ts`
 * validates with, so client and server rules cannot diverge. Nuxt UI's UForm
 * accepts any Standard Schema, which Zod 4 implements natively.
 */
import { postCreateSchema } from '#shared/schemas/post'
import type { PostWithAuthor } from '#shared/types/api'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ middleware: 'auth' })

type Schema = z.output<typeof postCreateSchema>

const state = reactive({
  title: '',
  slug: '',
  body: '',
  published: false
})

const toast = useToast()

const { submit, pending, errors } = useApiForm('/api/posts', {
  method: 'POST',
  onSuccess: async (data) => {
    toast.add({ title: 'Post created', color: 'success' })
    await navigateTo(`/posts/${(data as PostWithAuthor).id}`)
  }
})

/** Derive the slug from the title until the user edits the slug themselves. */
const slugTouched = ref(false)
watch(() => state.title, (title) => {
  if (slugTouched.value) return
  state.slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  await submit(event.data)
}
</script>

<template>
  <UContainer class="py-10 max-w-2xl">
    <h1 class="text-2xl font-semibold mb-6">
      New post
    </h1>

    <UForm
      :schema="postCreateSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Title"
        name="title"
        required
        :error="errors.title"
      >
        <UInput
          v-model="state.title"
          placeholder="How I learned to stop worrying"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Slug"
        name="slug"
        required
        :error="errors.slug"
        description="Lowercase letters, numbers and hyphens."
      >
        <UInput
          v-model="state.slug"
          placeholder="how-i-learned"
          class="w-full"
          @input="slugTouched = true"
        />
      </UFormField>

      <UFormField
        label="Body"
        name="body"
        :error="errors.body"
      >
        <UTextarea
          v-model="state.body"
          :rows="10"
          class="w-full"
        />
      </UFormField>

      <UFormField name="published">
        <UCheckbox
          v-model="state.published"
          label="Publish immediately"
        />
      </UFormField>

      <div class="flex gap-2">
        <UButton
          type="submit"
          :loading="pending"
          label="Create post"
        />
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          label="Cancel"
        />
      </div>
    </UForm>
  </UContainer>
</template>
