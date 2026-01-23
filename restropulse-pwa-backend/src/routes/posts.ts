import express, { Request, Response } from 'express';
import { MOCK_POSTS } from '../data/mockData.js';
import { ApiResponse, Post } from '../models/types.js';

const router = express.Router();

// In-memory storage
let posts = [...MOCK_POSTS];

// Get all posts
router.get('/', (_req: Request, res: Response<ApiResponse<Post[]>>) => {
    res.json({
        success: true,
        data: posts
    });
});

// Get post by ID
router.get('/:id', (req: Request, res: Response<ApiResponse<Post>>) => {
    const { id } = req.params;
    const post = posts.find(p => p.id === id);

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
});

// Create new post
router.post('/', (req: Request, res: Response<ApiResponse<Post>>) => {
    const newPost: Post = {
        id: 'p' + (posts.length + 1),
        ...req.body
    };

    posts.unshift(newPost);

    res.status(201).json({
        success: true,
        data: newPost,
        message: 'Post created successfully'
    });
});

// Update post
router.put('/:id', (req: Request, res: Response<ApiResponse<Post>>) => {
    const { id } = req.params;
    const index = posts.findIndex(p => p.id === id);

    if (index !== -1) {
        posts[index] = { ...posts[index], ...req.body, id };
        res.json({
            success: true,
            data: posts[index],
            message: 'Post updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Post not found'
        });
    }
});

// Delete post
router.delete('/:id', (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const index = posts.findIndex(p => p.id === id);

    if (index !== -1) {
        posts.splice(index, 1);
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
});

export default router;
