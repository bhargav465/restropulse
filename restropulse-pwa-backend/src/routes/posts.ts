import express, { Request, Response } from 'express';
import { findAllPosts, findPostById, createPost, updatePost, deletePost } from '../db/posts.js';
import { ApiResponse, Post } from '../models/types.js';

const router = express.Router();

// Get all posts
router.get('/', async (_req: Request, res: Response<ApiResponse<Post[]>>) => {
    try {
        const posts = await findAllPosts();
        res.json({
            success: true,
            data: posts
        });
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get post by ID
router.get('/:id', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const { id } = req.params;
        const post = await findPostById(id);

        if (post) {
            res.json({
                success: true,
                data: post
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
    } catch (error) {
        console.error('Get post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Create new post
router.post('/', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const newPost = await createPost(req.body);
        res.status(201).json({
            success: true,
            data: newPost,
            message: 'Post created successfully'
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update post
router.put('/:id', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const { id } = req.params;
        const post = await updatePost(id, req.body);

        if (post) {
            res.json({
                success: true,
                data: post,
                message: 'Post updated successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
    } catch (error) {
        console.error('Update post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Delete post
router.delete('/:id', async (req: Request, res: Response<ApiResponse>) => {
    try {
        const { id } = req.params;
        const deleted = await deletePost(id);

        if (deleted) {
            res.json({
                success: true,
                message: 'Post deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;
