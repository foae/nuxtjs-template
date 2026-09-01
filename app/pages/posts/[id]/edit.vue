<script setup lang="ts">
/**
 * Edit / delete a post you own.
 *
 * Note the schema: `postUpdateSchema`, not `postCreateSchema`. The update
 * contract carries no `.default()`, so omitting a field means "leave it
 * alone" rather than "reset it" — see shared/schemas/post.ts for why that
 * distinction destroyed data when it was got wrong.
 */
import { postUpdateSchema } from '#shared/schemas/post'
import type { PostWithAuthor } from '#shared/types/api'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ middleware: 'auth' })

useSeoMeta({ title: 'Edit post' })

const route = useRoute()
const toast = useToast()
const { user } = useUserSession()
const id = route.params.id as string

type Schema = z.output<typeof postUpdateSchema>

const { data: post, error } = await useFetch<PostWithAuthor>(`/api/posts/${id}`)

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusMessage ?? 'Failed to load post',
    fatal: true
  })
}

// The API enforces ownership too; this only avoids showing a form that is
// guaranteed to 404 on submit.
if (post.value && post.value.author.id !== user.value?.id) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const state = reactive({
  title: post.value?.title ?? '',
  slug: post.value?.slug ?? '',
  body: post.value?.body ?? '',
  published: post.value?.published ?? false
})

const { submit, pending, errors } = useApiForm<PostWithAuthor>(`/api/posts/${id}`, {
  method: 'PATCH',
  onSuccess: async () => {
    toast.add({ title: 'Post saved', color: 'success' })
    await navigateTo(`/posts/${id}`)
  }
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  await submit(event.data)
}

const deleting = ref(false)

async function remove() {
  if (!confirm('Delete this post? This cannot be undone.')) return

  deleting.value = true
  try {
    await $fetch(`/api/posts/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Post deleted', color: 'neutral' })
    await navigateTo('/')
  } catch {
    toast.add({ title: 'Could not delete the post', color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 max-w-2xl">
    <h1 class="text-2xl font-display font-semibold tracking-tight mb-6">
      Edit post
    </h1>

    <UForm
      :schema="postUpdateSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Title"
        name="title"
        :error="errors.title"
      >
        <UInput
          v-model="state.title"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Slug"
        name="slug"
        :error="errors.slug"
        description="Lowercase letters, numbers and hyphens."
      >
        <UInput
          v-model="state.slug"
          class="w-full"
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
          label="Published"
        />
      </UFormField>

      <div class="flex items-center gap-2">
        <UButton
          type="submit"
          :loading="pending"
          label="Save changes"
        />
        <UButton
          :to="`/posts/${id}`"
          color="neutral"
          variant="ghost"
          label="Cancel"
        />
        <UButton
          class="ms-auto"
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :loading="deleting"
          label="Delete"
          @click="remove"
        />
      </div>
    </UForm>
  </UContainer>
</template>
