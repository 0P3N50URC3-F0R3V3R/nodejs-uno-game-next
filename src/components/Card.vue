<template>
    <div class="card" :class="[hoverable, {'card-peeking': peeking}]" :style="{ zIndex: cardZIndex }" ref="animateCard" @mouseenter="onHoverStart" @mouseleave="onHoverEnd">
        <div class="inner" :class="innerClass" ref="animateFlip" @click="click">
            <div class="card-front-face">
                <CardTemplate :type="card.type"></CardTemplate>
                <div v-if="showOverlay" class="overlay"></div>
            </div>
            <div class="card-back-face"></div>
        </div>
    </div>
</template>

<script>

    import gsap from "gsap"
    import CardTemplate from "../components/CardTemplate"

    export default {
        name: "Card",
        props: {
            clickHandler:{ type:Function },
            transitionFinishHandler:{ type:Function },
            card: { type: Object },
            active: {type: Boolean},
            hardcoreMode: {type: Boolean, default: false}
        },
        components:{CardTemplate},
        data:function(){
            return { peeking: false, peekZBoost: false };
        },
        watch:{
            'card.transform': {
                handler: function (after, before) {
                    this.transformAnimate();
                },
                deep: true
            }  
        },
        computed:{
            innerClass:function(){
                return this.card.type?'':'hidden';
            },
            hoverable:function(){
                return (this.card.nextMoveValid && this.active && !this.hardcoreMode)?'card-hoverable':'';
            },
            showOverlay:function(){
                return (!this.card.nextMoveValid && this.active && this.card.owner !== 'dsc' && !this.hardcoreMode);
            },
            cardZIndex:function(){
                if(this.peekZBoost) return 99999;
                return this.card.transform ? Math.round(this.card.transform.z) : 0;
            }
        },
        methods:{
            click:function(){
                this.clickHandler(this.card);
            },
            onHoverStart:function(){
                // Only meaningful on your own turn -- otherwise there's no decision to
                // make and the raise is just visual noise while watching others play.
                if(!this.active || this._peekTimer) return;
                if(this._peekDropTimer){ clearTimeout(this._peekDropTimer); this._peekDropTimer = null; }
                let self = this;
                // 1.3s delay so casually sweeping the mouse across a hand doesn't
                // trigger a peek on every card it passes over — deliberate hold only.
                this._peekTimer = setTimeout(function(){
                    self.peeking = true;
                    self.peekZBoost = true;
                    self._peekTimer = null;
                }, 1300);
            },
            onHoverEnd:function(){
                if(this._peekTimer){
                    clearTimeout(this._peekTimer);
                    this._peekTimer = null;
                }
                this.peeking = false;
                // Keep the raised z-index through the 0.2s shrink-back transition below,
                // or the card visually snaps under its neighbors mid-shrink instead of
                // settling back into place on top of them.
                if(this.peekZBoost){
                    let self = this;
                    this._peekDropTimer = setTimeout(function(){
                        self.peekZBoost = false;
                        self._peekDropTimer = null;
                    }, 200);
                }
            },
            transitionFinish:function(){
                this.transitionFinishHandler(this.card);
            },
            transformAnimate:function(){
                if(typeof this.card.transform !== 'undefined'){
                    let parent = this;
                    gsap.to(this.$refs.animateCard,
                        {
                            x: this.card.transform.x,
                            y: this.card.transform.y,
                            z: this.card.transform.z,
                            rotation: this.card.transform.angle,
                            scaleX: this.card.transform.scale,
                            scaleY: this.card.transform.scale,
                            duration: this.card.transform.d,
                            delay: this.card.transform.delay || 0,
                            overwrite: true,
                            onComplete: parent.transitionFinish
                        });
                }
            }
        },
        mounted:function(){
            this.transformAnimate();
        }
    }
</script>
 
<style scoped>
    .card{
        position:absolute;
        width:93px;
        height:140px;
        background-color: transparent;
        perspective: 1000px;
        transform-origin: 0px 70px;
        top:0;
        left:0;
    }
    .card-hoverable .inner:hover{
        box-shadow: 0px 0px 1px 5px rgba(255,234,0,1);
    }
    /* Peek-on-hover: only touches the .inner face, never the gsap-driven .card
       node itself, so it can't fight the game's own position/z-index tweening.
       :not(.hidden) keeps it a no-op on face-down (opponent) cards. */
    .card-peeking .inner:not(.hidden){
        transform: scale(1.45) translateY(-55px);
        transition: transform 0.2s ease-out;
        box-shadow: 0 8px 24px rgba(0,0,0,0.7);
    }
    .overlay{
        display:block;
        position:absolute;
        top:0;
        left:0;
        width:100%;
        height:100%;
        border-radius:8px;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;        
        background-color: rgba(0, 0, 0, 0.4);
    }  
    .inner{
        left:-46px;
        position: relative;
        width: 100%;
        height: 100%;
        transition: transform 1.0s;
        transform-style: preserve-3d;
        transform-origin: 0px 70px;
        border-radius:8px;
    }
    .inner.hidden{
        transform: rotateY(-180deg) translateX(-93px);
    }
    .card-front-face{
        color: black;
        display:block;
        position:absolute;
        width:93px;
        height:140px;
        border-radius:8px;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
    }
    .card-back-face{
        color: white;
        display:block;
        position:absolute;
        width:93px;
        height:140px;
        border-radius:8px;
        background:url('../../public/img/back.png') no-repeat;
        background-size:100% 100%;        
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        transform: rotateY(180deg);
    }   

</style>